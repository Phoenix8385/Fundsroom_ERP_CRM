import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { Role } from '../types/auth';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Challans router — mounted at /challans behind `authenticate`.
 * Admin and Sales only.
 */
const router = Router();

router.use(requireRole(Role.ADMIN, Role.SALES));

const stub = asyncHandler(async () => {
  throw AppError.notImplemented('Not implemented yet');
});

router.get('/', stub); // list challans
router.get('/:id', stub); // fetch one challan
router.post('/', stub); // create challan
router.patch('/:id', stub); // update challan
router.delete('/:id', stub); // delete challan

export default router;
