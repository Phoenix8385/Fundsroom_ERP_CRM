import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { isRole, type Role } from '../types/auth';
import { AppError } from '../utils/AppError';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not set — check your .env file');
  }

  return secret;
}

/** Pulls the raw token out of an `Authorization: Bearer <token>` header. */
function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, token] = header.split(' ');

  if (!token || scheme?.toLowerCase() !== 'bearer') return null;

  return token.trim() || null;
}

/**
 * Verifies the Bearer JWT and attaches `{ userId, role }` to `req.user`.
 * Rejects with 401 for a missing, malformed, expired or otherwise invalid token.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return next(AppError.unauthorized('Missing or malformed Authorization header'));
  }

  let payload: string | JwtPayload;

  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(AppError.unauthorized('Token expired'));
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(AppError.unauthorized('Invalid token'));
    }
    return next(err);
  }

  if (typeof payload === 'string') {
    return next(AppError.unauthorized('Invalid token payload'));
  }

  const userId = payload.sub ?? payload['userId'];
  const role = payload['role'];

  if (typeof userId !== 'string' || !userId) {
    return next(AppError.unauthorized('Token is missing a user identifier'));
  }

  if (!isRole(role)) {
    return next(AppError.unauthorized('Token is missing a valid role'));
  }

  req.user = { userId, role };

  return next();
};

/**
 * Restricts a route (or a whole router) to the listed roles.
 * 401 when there is no authenticated user at all, 403 when the role is not allowed.
 * Always mount behind `authenticate`.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Role '${req.user.role}' is not permitted to access this resource`,
        ),
      );
    }

    return next();
  };
}
