import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an async route handler so a rejected promise is forwarded to the
 * global error handler instead of becoming an unhandled rejection.
 *
 * Lets route bodies stay try/catch-free:
 *
 *   router.get('/', asyncHandler(async (req, res) => {
 *     const rows = await prisma.customer.findMany();
 *     res.json(rows);
 *   }));
 */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
