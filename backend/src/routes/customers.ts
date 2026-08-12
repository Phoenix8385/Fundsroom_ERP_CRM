import { CustomerStatus, CustomerType, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { Role } from '../types/auth';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam, validationMessage } from '../utils/validation';

/**
 * Customers router — mounted at /customers behind `authenticate`.
 *
 * Reads and note-taking are open to any authenticated role (warehouse and
 * accounts need to look up whoever they are packing or billing for); creating
 * and editing a customer stays with Admin and Sales.
 */
const router = Router();

/** Indian mobile: exactly ten digits, first one 6-9. */
const MOBILE_PATTERN = /^[6-9]\d{9}$/;

/** GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum. */
const GST_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Accepts either a plain ISO date (2026-08-20) or a full ISO timestamp, since
 * a date picker sends the former and an API client usually sends the latter.
 * Handed to Prisma as a Date.
 */
const isoDate = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })], {
    error: 'followUpDate must be an ISO date (YYYY-MM-DD) or date-time',
  })
  .transform((value) => new Date(value));

/**
 * Optional free-text field: trims, and treats an empty string as "not set"
 * rather than storing "" — a form posts "" for every field the user left blank.
 */
const optionalText = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const statusEnum = z.enum(CustomerStatus, {
  error: 'Status must be LEAD, ACTIVE or INACTIVE',
});

const customerSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters'),
  mobile: z
    .string({ error: 'Mobile number is required' })
    .trim()
    .regex(MOBILE_PATTERN, 'Mobile must be 10 digits starting with 6-9'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Email must be a valid address'))
    .optional(),
  businessName: optionalText,
  gstNumber: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(GST_PATTERN, 'GST number must be a valid 15-character GSTIN'))
    .optional(),
  // Built from the Prisma enums, so the API and the database cannot drift apart.
  type: z.enum(CustomerType, { error: 'Type must be RETAIL, WHOLESALE or DISTRIBUTOR' }),
  address: optionalText,
  status: statusEnum.default(CustomerStatus.LEAD),
  followUpDate: isoDate.optional(),
});

/**
 * Every field optional on update — a PUT here only touches what it sends.
 *
 * `status` is redeclared because `.partial()` keeps the default: without this,
 * an update that omits `status` would still parse to LEAD and quietly demote an
 * ACTIVE customer.
 */
const customerUpdateSchema = customerSchema
  .partial()
  .extend({ status: statusEnum.optional() });

const querySchema = z.object({
  search: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional(),
  status: z.enum(CustomerStatus).optional(),
  type: z.enum(CustomerType).optional(),
  page: z.coerce.number().int().min(1, 'page must be 1 or greater').default(1),
  // Capped, so a single call can never ask for the whole table.
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'pageSize must be 1 or greater')
    .max(100, 'pageSize cannot exceed 100')
    .default(20),
});

const noteSchema = z.object({
  text: z.string({ error: 'Note text is required' }).trim().min(1, 'Note text is required'),
});

// GET /customers — paginated list with search and filters.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    const { search, status, type, page, pageSize } = parsed.data;

    const where: Prisma.CustomerWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search, mode: 'insensitive' } },
        { businessName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) where.status = status;
    if (type) where.type = type;

    // Explicit ordering: without a deterministic sort, skip/take can repeat or
    // drop rows between pages.
    const [data, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({ data, total, page, pageSize });
  }),
);

// GET /customers/:id — one customer with its notes and latest challans.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        notes: { orderBy: { createdAt: 'desc' } },
        challans: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!customer) {
      throw AppError.notFound(`Customer ${id} not found`);
    }

    res.json(customer);
  }),
);

// POST /customers — create a customer.
router.post(
  '/',
  requireRole(Role.ADMIN, Role.SALES),
  asyncHandler(async (req, res) => {
    const parsed = customerSchema.safeParse(req.body);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    const customer = await prisma.customer.create({ data: parsed.data });

    res.status(201).json(customer);
  }),
);

/**
 * Update handler shared by PUT and PATCH — both carry partial bodies here.
 * A missing row surfaces as Prisma's P2025, which the global error handler
 * already turns into a 404, so there is no try/catch to duplicate it.
 */
const updateCustomer = asyncHandler(async (req, res) => {
  const parsed = customerUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    throw AppError.badRequest(validationMessage(parsed.error.flatten()));
  }

  const customer = await prisma.customer.update({
    where: { id: routeParam(req.params.id) },
    data: parsed.data,
  });

  res.json(customer);
});

router.put('/:id', requireRole(Role.ADMIN, Role.SALES), updateCustomer);
router.patch('/:id', requireRole(Role.ADMIN, Role.SALES), updateCustomer);

// POST /customers/:id/notes — any authenticated role may log a note.
router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);

    const parsed = noteSchema.safeParse(req.body);

    if (!parsed.success) {
      throw AppError.badRequest(validationMessage(parsed.error.flatten()));
    }

    // Checked up front so a bad id answers 404 rather than a foreign-key 400.
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!customer) {
      throw AppError.notFound(`Customer ${id} not found`);
    }

    const note = await prisma.note.create({
      data: { customerId: customer.id, text: parsed.data.text },
    });

    res.status(201).json(note);
  }),
);

// DELETE /customers/:id — still unspecified; see Phase 1 notes.
router.delete(
  '/:id',
  requireRole(Role.ADMIN, Role.SALES),
  asyncHandler(async () => {
    throw AppError.notImplemented('Not implemented yet');
  }),
);

export default router;
