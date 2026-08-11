import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { Role } from '../types/auth';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Customers router — mounted at /customers behind `authenticate`.
 * Admin and Sales only.
 */
const router = Router();

router.use(requireRole(Role.ADMIN, Role.SALES));

const stub = asyncHandler(async () => {
  throw AppError.notImplemented('Not implemented yet');
});

router.get('/', stub); // list customers
router.get('/:id', stub); // fetch one customer
router.post('/', stub); // create customer
router.patch('/:id', stub); // update customer
router.delete('/:id', stub); // delete customer

export default router;
