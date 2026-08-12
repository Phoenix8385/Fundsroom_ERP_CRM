import { ChallanStatus, MovementType, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { Role } from '../types/auth';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { isUniqueViolationOn } from '../utils/prismaError';
import { routeParam, validationMessage } from '../utils/validation';

/**
 * Challans router — mounted at /challans behind `authenticate`.
 *
 * Reading is open to any authenticated role (warehouse packs against a challan,
 * accounts bills from one); raising, confirming and cancelling stay with Admin
 * and Sales.
 */
const router = Router();

const writeRoles = requireRole(Role.ADMIN, Role.SALES);

const createChallanSchema = z.object({
  customerId: z.string({ error: 'customerId is required' }).trim().min(1, 'customerId is required'),
  items: z
    .array(
      z.object({
        productId: z
          .string({ error: 'productId is required' })
          .trim()
          .min(1, 'productId is required'),
        quantity: z.coerce
          .number({ error: 'quantity is required' })
          .int('quantity must be a whole number')
          .positive('quantity must be greater than 0'),
      }),
      { error: 'items is required' },
    )
    .min(1, 'A challan needs at least one item'),
});

const querySchema = z.object({
  status: z.enum(ChallanStatus, { error: 'Status must be DRAFT, CONFIRMED or CANCELLED' }).optional(),
  customerId: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional(),
  page: z.coerce.number().int().min(1, 'page must be 1 or greater').default(1),
  // Capped, so a single call can never ask for the whole table.
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'pageSize must be 1 or greater')
    .max(100, 'pageSize cannot exceed 100')
    .default(20),
});

/** How many times a challan-number collision is worth re-deriving before giving up. */
const MAX_NUMBER_ATTEMPTS = 3;

/**
 * Interactive transactions default to a 5s budget; confirm and cancel do a
 * handful of sequential round-trips per line, so this leaves headroom for a
 * large challan without letting a stuck transaction hold its locks forever.
 */
const TRANSACTION_TIMEOUT_MS = 10_000;

/**
 * Next challan number in `CH-<year>-<0001>` form.
 *
 * Derived from a row count, so two near-simultaneous creates can land on the
 * same value. The `@unique` on challanNumber is what stops the duplicate from
 * being written; `createChallan` below is what turns that rejection back into a
 * successful request.
 */
async function generateChallanNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const count = await tx.challan.count();

  return `CH-${year}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Creates the challan, re-deriving its number if it lost a race for one.
 *
 * A P2002 on challanNumber means someone else took the number between the count
 * and the insert — by the time we retry, the count includes their row, so the
 * next attempt derives a different one. Any other failure (including a P2002 on
 * some other column) is rethrown untouched for the global handler.
 */
async function createChallan(data: Omit<Prisma.ChallanUncheckedCreateInput, 'challanNumber'>) {
  for (let attempt = 1; ; attempt += 1) {
    const challanNumber = await generateChallanNumber(prisma);

    try {
      return await prisma.challan.create({
        data: { ...data, challanNumber },
        include: { items: true, customer: true },
      });
    } catch (err) {
      if (attempt >= MAX_NUMBER_ATTEMPTS || !isUniqueViolationOn(err, 'challanNumber')) {
        throw err;
      }
    }
  }
}

/**
 * Takes a row lock on the challan for the rest of the transaction.
 *
 * Without it two concurrent confirms both read status DRAFT, both pass the
 * stock check and both deduct — the status guard only holds if the row cannot
 * change underneath it.
 */
async function lockChallan(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Challan" WHERE "id" = ${id} FOR UPDATE
  `;

  return rows.length > 0;
}

/** Sums the ordered quantity per product — the same product may appear on several lines. */
function quantitiesByProduct(items: Array<{ productId: string; quantity: number }>) {
  const totals = new Map<string, number>();

  for (const item of items) {
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  }

  return totals;
}

// GET /challans — paginated list, newest first.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    const { status, customerId, page, pageSize } = parsed.data;

    const where: Prisma.ChallanWhereInput = {};

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    // Explicit ordering: without a deterministic sort, skip/take can repeat or
    // drop rows between pages.
    const [data, total] = await Promise.all([
      prisma.challan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { id: true, name: true } } },
      }),
      prisma.challan.count({ where }),
    ]);

    res.json({ data, total, page, pageSize });
  }),
);

// GET /challans/:id — one challan with its lines and customer.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);

    const challan = await prisma.challan.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });

    if (!challan) {
      throw AppError.notFound(`Challan ${id} not found`);
    }

    res.json(challan);
  }),
);

// POST /challans — raise a DRAFT challan. No stock moves at this stage.
router.post(
  '/',
  writeRoles,
  asyncHandler(async (req, res) => {
    const parsed = createChallanSchema.safeParse(req.body);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    const { customerId, items } = parsed.data;

    // `authenticate` runs before this router, so req.user is always set here.
    const createdBy = req.user?.userId;

    if (!createdBy) {
      throw AppError.unauthorized('Authentication required');
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      throw AppError.notFound(`Customer ${customerId} not found`);
    }

    const productIds = [...new Set(items.map((item) => item.productId))];

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, unitPrice: true },
    });

    const productById = new Map(products.map((product) => [product.id, product]));
    const missing = productIds.filter((id) => !productById.has(id));

    if (missing.length > 0) {
      throw AppError.notFound(
        `Product${missing.length > 1 ? 's' : ''} not found: ${missing.join(', ')}`,
      );
    }

    // name/sku/unitPrice are copied onto the line, not referenced: the challan
    // has to keep showing what was sold at the price it sold for, even after the
    // product is renamed or repriced.
    const lines = items.map((item) => {
      const product = productById.get(item.productId)!;

      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPrice: product.unitPrice,
        quantity: item.quantity,
      };
    });

    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

    const challan = await createChallan({
      customerId,
      totalQuantity,
      status: ChallanStatus.DRAFT,
      createdBy,
      items: { create: lines },
    });

    res.status(201).json(challan);
  }),
);

// PUT /challans/:id/confirm — deduct stock and move DRAFT to CONFIRMED.
router.put(
  '/:id/confirm',
  writeRoles,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const createdBy = req.user?.userId;

    if (!createdBy) {
      throw AppError.unauthorized('Authentication required');
    }

    const challan = await prisma.$transaction(
      async (tx) => {
        if (!(await lockChallan(tx, id))) {
          throw AppError.notFound(`Challan ${id} not found`);
        }

        // Re-read inside the transaction: anything fetched before it opened
        // could already be stale.
        const current = await tx.challan.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!current) {
          throw AppError.notFound(`Challan ${id} not found`);
        }

        if (current.status !== ChallanStatus.DRAFT) {
          throw AppError.conflict(`Challan is already ${current.status}`);
        }

        const required = quantitiesByProduct(current.items);

        // Locked in a fixed id order so two challans sharing products can never
        // grab the same rows in opposite orders and deadlock.
        const productIds = [...required.keys()].sort();

        const stockRows = await tx.$queryRaw<Array<{ id: string; currentStock: number }>>`
          SELECT "id", "currentStock" FROM "Product"
          WHERE "id" IN (${Prisma.join(productIds)})
          ORDER BY "id" FOR UPDATE
        `;

        const stockById = new Map(stockRows.map((row) => [row.id, row.currentStock]));

        // Every short line is reported at once — fixing them one 409 at a time
        // would be a miserable way to correct a ten-line challan.
        const shortages = [...required.entries()]
          .map(([productId, requested]) => ({
            productId,
            productName:
              current.items.find((item) => item.productId === productId)?.productName ?? 'Unknown',
            available: stockById.get(productId) ?? 0,
            requested,
          }))
          .filter((line) => line.available < line.requested);

        if (shortages.length > 0) {
          // Throwing rolls the transaction back, so nothing has been deducted.
          throw AppError.conflict('Insufficient stock', { shortages });
        }

        for (const item of current.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              quantityChanged: item.quantity,
              type: MovementType.OUT,
              reason: `Challan ${current.challanNumber} confirmed`,
              createdBy,
            },
          });
        }

        return tx.challan.update({
          where: { id },
          data: { status: ChallanStatus.CONFIRMED },
          include: { items: true, customer: true },
        });
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );

    res.json(challan);
  }),
);

// PUT /challans/:id/cancel — cancel, returning stock only if it was deducted.
router.put(
  '/:id/cancel',
  writeRoles,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const createdBy = req.user?.userId;

    if (!createdBy) {
      throw AppError.unauthorized('Authentication required');
    }

    const challan = await prisma.$transaction(
      async (tx) => {
        if (!(await lockChallan(tx, id))) {
          throw AppError.notFound(`Challan ${id} not found`);
        }

        const current = await tx.challan.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!current) {
          throw AppError.notFound(`Challan ${id} not found`);
        }

        if (current.status === ChallanStatus.CANCELLED) {
          throw AppError.conflict('Challan is already cancelled');
        }

        // Only a CONFIRMED challan ever took stock out, so only that one puts it
        // back — restocking a DRAFT would invent inventory that never left.
        if (current.status === ChallanStatus.CONFIRMED) {
          for (const item of current.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: { increment: item.quantity } },
            });

            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                quantityChanged: item.quantity,
                type: MovementType.IN,
                reason: `Challan ${current.challanNumber} cancelled`,
                createdBy,
              },
            });
          }
        }

        return tx.challan.update({
          where: { id },
          data: { status: ChallanStatus.CANCELLED },
          include: { items: true, customer: true },
        });
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );

    res.json(challan);
  }),
);

// PATCH /challans/:id — still unspecified; see Phase 1 notes.
router.patch(
  '/:id',
  writeRoles,
  asyncHandler(async () => {
    throw AppError.notImplemented('Not implemented yet');
  }),
);

// DELETE /challans/:id — still unspecified; see Phase 1 notes.
router.delete(
  '/:id',
  writeRoles,
  asyncHandler(async () => {
    throw AppError.notImplemented('Not implemented yet');
  }),
);

export default router;
