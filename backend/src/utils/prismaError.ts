import { Prisma } from '@prisma/client';

/**
 * Strips the quoting Postgres puts around an identifier that needs it.
 *
 * The driver adapter passes constraint columns through as they appear in the
 * DDL, so a camelCase column arrives as `"challanNumber"` — quotes included —
 * while an all-lowercase one like `sku` arrives bare. Comparing against a plain
 * column name fails on the former unless the quotes come off first.
 */
function unquote(field: unknown): string {
  return String(field).replace(/^"(.*)"$/, '$1');
}

/**
 * Digs the offending field names out of a P2002.
 *
 * Under Prisma 7's driver adapters they live on the wrapped driver error;
 * `meta.target` is the pre-7 shape, kept as a fallback.
 */
export function uniqueConstraintFields(
  meta: Record<string, unknown> | undefined,
): string[] | null {
  const adapterError = meta?.['driverAdapterError'] as
    | { cause?: { constraint?: { fields?: unknown } } }
    | undefined;

  const fields = adapterError?.cause?.constraint?.fields;

  if (Array.isArray(fields) && fields.length > 0) {
    return fields.map(unquote);
  }

  const target = meta?.['target'];

  if (Array.isArray(target) && target.length > 0) return target.map(unquote);
  if (typeof target === 'string' && target) return [unquote(target)];

  return null;
}

/**
 * True when `err` is a unique-constraint violation on exactly the named column.
 *
 * Lets a caller retry the one collision it knows how to resolve, while any
 * other duplicate still travels on to the global handler as a 409.
 */
export function isUniqueViolationOn(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }

  return uniqueConstraintFields(err.meta)?.includes(field) ?? false;
}
