/**
 * Error type for anything we deliberately throw from a route or middleware.
 *
 * Carries the HTTP status alongside the message so the global error handler can
 * turn it straight into a response without guessing. Anything that is *not* an
 * AppError is treated as an unexpected failure and reported as a generic 500.
 */
export class AppError extends Error {
  readonly statusCode: number;

  /** Marks the error as an expected, safe-to-expose failure. */
  readonly isOperational = true;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message = 'Bad request'): AppError {
    return new AppError(400, message);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(403, message);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(404, message);
  }

  static conflict(message = 'Conflict'): AppError {
    return new AppError(409, message);
  }

  static notImplemented(message = 'Not implemented yet'): AppError {
    return new AppError(501, message);
  }
}

export default AppError;
