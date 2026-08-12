import { MovementType, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { Role } from '../types/auth';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam, validationMessage } from '../utils/validation';

/**
 * Products router — mounted at /products behind `authenticate`.
 *
 * Reading the catalogue and its stock log is open to any authenticated role:
 * sales needs live stock to build a challan, accounts needs prices to bill.
 * Changing a product or moving stock stays with Admin and Warehouse.
 */
const router = Router();

const writeRoles = requireRole(Role.ADMIN, Role.WAREHOUSE);

/**
 * unitPrice is Decimal(10, 2) in Postgres: eight digits before the point, two
 * after. Anything larger is a numeric overflow at insert time, and a third
 * decimal is silently rounded — both are rejected up front instead.
 */
const MAX_UNIT_PRICE = 99_999_999.99;

/** SKUs are stored uppercase so "sku-1042" and "SKU-1042" are the same product. */
const skuField = z
  .string({ error: 'SKU is required' })
  .trim()
  .toUpperCase()
  .pipe(z.string().min(1, 'SKU is required'));

/**
 * Optional free-text field: trims, and treats an empty string as "not set"
 * rather than storing "" — a form posts "" for every field the user left blank.
 */
const optionalText = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const nonNegativeInt = (label: string) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`);

const productSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters'),
  sku: skuField,
  category: optionalText,
  unitPrice: z.coerce
    .number({ error: 'Unit price must be a number' })
    .positive('Unit price must be greater than 0')
    .max(MAX_UNIT_PRICE, 'Unit price is too large')
    .refine(
      (value) => Number.isInteger(Math.round(value * 100)) && value * 100 === Math.round(value * 100),
      'Unit price cannot have more than 2 decimal places',
    ),
  currentStock: nonNegativeInt('Current stock').default(0),
  minStockAlert: nonNegativeInt('Minimum stock alert').default(0),
  location: optionalText,
});

/**
 * Every field optional on update — a PUT here only touches what it sends.
 *
 * The stock fields are redeclared because `.partial()` keeps the default:
 * without this, an update that omits them would still parse to 0 and quietly
 * zero out a product's stock.
 */
const productUpdateSchema = productSchema.partial().extend({
  currentStock: nonNegativeInt('Current stock').optional(),
  minStockAlert: nonNegativeInt('Minimum stock alert').optional(),
});

/**
 * Query-string booleans arrive as text. `z.coerce.boolean()` is not usable here:
 * it applies JS truthiness, so the string "false" would coerce to `true`.
 */
const booleanQuery = z
  .enum(['true', 'false', '1', '0'], { error: 'Must be true or false' })
  .transform((value) => value === 'true' || value === '1');

const pageFields = {
  page: z.coerce.number().int().min(1, 'page must be 1 or greater').default(1),
};

const querySchema = z.object({
  search: optionalText,
  category: optionalText,
  lowStockOnly: booleanQuery.optional(),
  ...pageFields,
  // Capped, so a single call can never ask for the whole table.
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'pageSize must be 1 or greater')
    .max(100, 'pageSize cannot exceed 100')
    .default(20),
});

/** The stock log is a history feed rather than a primary list, so it pages larger. */
const stockLogQuerySchema = z.object({
  ...pageFields,
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'pageSize must be 1 or greater')
    .max(100, 'pageSize cannot exceed 100')
    .default(50),
});

const adjustStockSchema = z.object({
  quantityChanged: z.coerce
    .number({ error: 'Quantity is required' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0'),
  type: z.enum(MovementType, { error: 'Type must be IN or OUT' }),
  reason: z.string({ error: 'Reason is required' }).trim().min(3, 'Reason must be at least 3 characters'),
});

// GET /products — paginated list with search, category and low-stock filters.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    const { search, category, lowStockOnly, page, pageSize } = parsed.data;

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) where.category = category;

    // Comparing two columns needs a field reference. Doing it in the `where`
    // keeps the filter inside the query, so skip/take and count() stay correct
    // — filtering after the fetch would page over the wrong row set and report
    // a total that does not match the returned rows.
    if (lowStockOnly) {
      where.currentStock = { lte: prisma.product.fields.minStockAlert };
    }

    // Explicit ordering: without a deterministic sort, skip/take can repeat or
    // drop rows between pages.
    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ data, total, page, pageSize });
  }),
);

// GET /products/:id — one product.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);

    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw AppError.notFound(`Product ${id} not found`);
    }

    res.json(product);
  }),
);

// GET /products/:id/stock-log — paginated movement history, newest first.
router.get(
  '/:id/stock-log',
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);

    const parsed = stockLogQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    const { page, pageSize } = parsed.data;

    // Checked up front so an unknown id answers 404 rather than an empty log.
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      throw AppError.notFound(`Product ${id} not found`);
    }

    const [data, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.stockMovement.count({ where: { productId: product.id } }),
    ]);

    res.json({ data, total, page, pageSize });
  }),
);

// POST /products — create a product.
router.post(
  '/',
  writeRoles,
  asyncHandler(async (req, res) => {
    const parsed = productSchema.safeParse(req.body);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    // A duplicate SKU trips the unique index; the global handler maps P2002 to
    // a 409, so there is no pre-check to race against here.
    const product = await prisma.product.create({ data: parsed.data });

    res.status(201).json(product);
  }),
);

/**
 * Update handler shared by PUT and PATCH — both carry partial bodies here.
 * A missing row surfaces as Prisma's P2025, which the global error handler
 * already turns into a 404, so there is no try/catch to duplicate it.
 */
const updateProduct = asyncHandler(async (req, res) => {
  const parsed = productUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    throw AppError.badRequest(validationMessage(parsed.error.flatten()));
  }

  const product = await prisma.product.update({
    where: { id: routeParam(req.params.id) },
    data: parsed.data,
  });

  res.json(product);
});

router.put('/:id', writeRoles, updateProduct);
router.patch('/:id', writeRoles, updateProduct);

// POST /products/:id/adjust-stock — move stock in or out, logging the movement.
router.post(
  '/:id/adjust-stock',
  writeRoles,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);

    const parsed = adjustStockSchema.safeParse(req.body);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    const { quantityChanged, type, reason } = parsed.data;

    // `authenticate` runs before this router, so req.user is always set here.
    const createdBy = req.user?.userId;

    if (!createdBy) {
      throw AppError.unauthorized('Authentication required');
    }

    const result = await prisma.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE: the row stays locked for the rest of the
      // transaction, so two concurrent OUT adjustments cannot both read the
      // same starting stock and each subtract from it — which would drive the
      // total below zero despite the check below.
      const locked = await tx.$queryRaw<Array<{ currentStock: number }>>`
        SELECT "currentStock" FROM "Product" WHERE "id" = ${id} FOR UPDATE
      `;

      const current = locked[0];

      if (!current) {
        throw AppError.notFound(`Product ${id} not found`);
      }

      const newStock =
        type === MovementType.OUT
          ? current.currentStock - quantityChanged
          : current.currentStock + quantityChanged;

      // Rejected before either write, so the transaction rolls back untouched.
      if (newStock < 0) {
        throw AppError.conflict(
          `Insufficient stock: ${current.currentStock} available, cannot remove ${quantityChanged}`,
        );
      }

      const product = await tx.product.update({
        where: { id },
        data: { currentStock: newStock },
      });

      // Stored as the positive magnitude — `type` carries the direction.
      const movement = await tx.stockMovement.create({
        data: { productId: id, quantityChanged, type, reason, createdBy },
      });

      return { product, movement };
    });

    res.status(201).json(result);
  }),
);

// DELETE /products/:id — still unspecified; see Phase 1 notes.
router.delete(
  '/:id',
  writeRoles,
  asyncHandler(async () => {
    throw AppError.notImplemented('Not implemented yet');
  }),
);

export default router;
