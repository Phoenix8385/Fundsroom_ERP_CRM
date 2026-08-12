/**
 * Client-side mirrors of the zod rules in backend/src/routes.
 *
 * These exist to catch bad input before a round-trip, not to replace the server
 * check. Every rule here has a twin in the backend schema; if one moves, move
 * both or the form will start rejecting input the API would have accepted.
 */

/** customers.ts — /^[6-9]\d{9}$/ */
const MOBILE_PATTERN = /^[6-9]\d{9}$/;

/** customers.ts — 15-character GSTIN */
const GST_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Loose shape check only — the server owns real address validation. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Errors<T> = Partial<Record<keyof T, string>>;

export interface CustomerFormValues {
  name: string;
  mobile: string;
  email: string;
  businessName: string;
  gstNumber: string;
  type: string;
  address: string;
  status: string;
  followUpDate: string;
}

export function validateCustomer(values: CustomerFormValues): Errors<CustomerFormValues> {
  const errors: Errors<CustomerFormValues> = {};

  if (values.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }

  if (!MOBILE_PATTERN.test(values.mobile.trim())) {
    errors.mobile = 'Mobile must be 10 digits starting with 6-9';
  }

  const email = values.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = 'Email must be a valid address';
  }

  const gst = values.gstNumber.trim().toUpperCase();
  if (gst && !GST_PATTERN.test(gst)) {
    errors.gstNumber = 'GST number must be a valid 15-character GSTIN';
  }

  if (!values.type) {
    errors.type = 'Type is required';
  }

  return errors;
}

export interface ProductFormValues {
  name: string;
  sku: string;
  category: string;
  unitPrice: string;
  currentStock: string;
  minStockAlert: string;
  location: string;
}

/** products.ts — Decimal(10, 2), so 8 digits before the point and 2 after. */
const MAX_UNIT_PRICE = 99_999_999.99;

export function validateProduct(
  values: ProductFormValues,
  { isEdit = false } = {},
): Errors<ProductFormValues> {
  const errors: Errors<ProductFormValues> = {};

  if (values.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }

  if (values.sku.trim().length < 1) {
    errors.sku = 'SKU is required';
  }

  const price = Number(values.unitPrice);

  if (values.unitPrice.trim() === '' || Number.isNaN(price)) {
    errors.unitPrice = 'Unit price is required';
  } else if (price <= 0) {
    errors.unitPrice = 'Unit price must be greater than 0';
  } else if (price > MAX_UNIT_PRICE) {
    errors.unitPrice = 'Unit price is too large';
  } else if (Math.round(price * 100) !== price * 100) {
    errors.unitPrice = 'Unit price cannot have more than 2 decimal places';
  }

  for (const field of ['currentStock', 'minStockAlert'] as const) {
    const raw = values[field];

    // On edit these are left blank to mean "unchanged", which is exactly what
    // the partial update schema expects.
    if (raw.trim() === '') {
      if (!isEdit && field === 'currentStock') continue;
      continue;
    }

    const parsed = Number(raw);

    if (!Number.isInteger(parsed) || parsed < 0) {
      errors[field] = 'Must be a whole number, 0 or more';
    }
  }

  return errors;
}

/** products.ts — adjustStockSchema */
export function validateStockAdjustment(quantity: string, reason: string): Errors<{ quantity: string; reason: string }> {
  const errors: Errors<{ quantity: string; reason: string }> = {};
  const parsed = Number(quantity);

  if (quantity.trim() === '' || !Number.isInteger(parsed) || parsed <= 0) {
    errors.quantity = 'Quantity must be a whole number above 0';
  }

  if (reason.trim().length < 3) {
    errors.reason = 'Reason must be at least 3 characters';
  }

  return errors;
}

/** customers.ts — noteSchema */
export function validateNote(text: string): string | null {
  return text.trim().length < 1 ? 'Note cannot be empty' : null;
}

export function hasErrors<T>(errors: Errors<T>): boolean {
  return Object.values(errors).some(Boolean);
}
