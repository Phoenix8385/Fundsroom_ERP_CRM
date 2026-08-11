import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Public auth router — mounted at /auth without `authenticate`.
 */
const router = Router();

const loginSchema = z.object({
  // Normalise before validating, so a pasted "  Admin@Fundsroom.TEST " still
  // matches the stored address.
  email: z
    .string({ error: 'A valid email address is required' })
    .trim()
    .toLowerCase()
    .pipe(z.email('A valid email address is required')),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

/** How long an issued session token stays valid. */
const TOKEN_TTL = '8h';

/**
 * Compared against when no user matches the submitted email, so a failed login
 * costs the same time whether or not the account exists — otherwise the
 * response latency itself leaks which emails are registered.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-password-placeholder', 10);

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  // Fail loudly rather than signing tokens with `undefined`.
  if (!secret) {
    throw new AppError(500, 'Server authentication is misconfigured');
  }

  return secret;
}

// POST /auth/register — create a user, hash the password with bcrypt.
router.post(
  '/register',
  asyncHandler(async () => {
    throw AppError.notImplemented('Not implemented yet');
  }),
);

// POST /auth/login — verify credentials and issue a JWT.
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      throw AppError.badRequest(
        parsed.error.issues[0]?.message ?? 'Invalid login payload',
      );
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, role: true, password: true },
    });

    // Always run a bcrypt comparison, even for an unknown email (see above).
    const passwordMatches = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    // One message for both failure modes — revealing which of the two was wrong
    // would let an attacker enumerate registered accounts.
    if (!user || !passwordMatches) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), {
      expiresIn: TOKEN_TTL,
    });

    // Fields listed explicitly: never spread the Prisma record, or the password
    // hash rides along into the response.
    res.json({ token, role: user.role, name: user.name });
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
