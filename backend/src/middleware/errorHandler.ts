import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError';

interface ErrorBody {
  error: string;
}

/**
 * Digs the offending field names out of a P2002.
 *
 * Under Prisma 7's driver adapters they live on the wrapped driver error;
 * `meta.target` is the pre-7 shape, kept as a fallback.
 */
function conflictFields(meta: Record<string, unknown> | undefined): string | null {
  const adapterError = meta?.['driverAdapterError'] as
    | { cause?: { constraint?: { fields?: unknown } } }
    | undefined;

  const fields = adapterError?.cause?.constraint?.fields;

  if (Array.isArray(fields) && fields.length > 0) {
    return fields.join(', ');
  }

  const target = meta?.['target'];

  if (Array.isArray(target) && target.length > 0) return target.join(', ');
  if (typeof target === 'string' && target) return target;

  return null;
}

/** Maps the Prisma error codes we actually expect onto sane HTTP statuses. */
function mapPrismaError(err: unknown): AppError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      // Unique constraint failed on the given field(s).
      case 'P2002': {
        const fields = conflictFields(err.meta);
        return AppError.conflict(
          fields
            ? `A record with this ${fields} already exists`
            : 'A record with these values already exists',
        );
      }
      // An operation failed because it depends on records that were not found.
      case 'P2025':
        return AppError.notFound('Record not found');
      // Foreign key constraint failed.
      case 'P2003':
        return AppError.badRequest('Related record does not exist');
      // Value too long for the column.
      case 'P2000':
        return AppError.badRequest('One of the provided values is too long');
      default:
        return null;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return AppError.badRequest('Invalid data supplied');
  }

  return null;
}

/** Terminal 404 for any request that matched no route. Mount before errorHandler. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Cannot ${req.method} ${req.originalUrl}`));
};

/**
 * Global error handler — must be mounted last and must keep all four
 * parameters, otherwise Express treats it as ordinary middleware.
 *
 * Known failures answer with their real status and message; everything else is
 * logged server-side and reported to the client as a generic 500.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // Express 5 delegates to the default handler if headers are already sent.
  if (res.headersSent) {
    return next(err);
  }

  const appError = err instanceof AppError ? err : mapPrismaError(err);

  if (appError) {
    res.status(appError.statusCode).json({ error: appError.message } satisfies ErrorBody);
    return;
  }

  // Malformed JSON body from express.json().
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON body' } satisfies ErrorBody);
    return;
  }

  // Unexpected: keep the real cause on the server, hand the client nothing useful.
  console.error('[unhandled error]', err);

  res.status(500).json({ error: 'Internal server error' } satisfies ErrorBody);
};
