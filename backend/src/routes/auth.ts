import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Public auth router — mounted at /auth without `authenticate`.
 * Endpoints are stubbed until the User model lands in schema.prisma.
 */
const router = Router();

// POST /auth/register — create a user, hash the password with bcrypt.
router.post(
  '/register',
  asyncHandler(async () => {
    throw AppError.notImplemented('Not implemented yet');
  }),
);

// POST /auth/login — verify credentials, sign a JWT carrying { sub, role }.
router.post(
  '/login',
  asyncHandler(async () => {
    throw AppError.notImplemented('Not implemented yet');
  }),
);

// GET /auth/me — the one authenticated route on this router.
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

export default router;
