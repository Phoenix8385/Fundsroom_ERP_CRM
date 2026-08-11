import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { Role } from '../types/auth';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Products router — mounted at /products behind `authenticate`.
 * Admin and Warehouse only.
 */
const router = Router();

router.use(requireRole(Role.ADMIN, Role.WAREHOUSE));

const stub = asyncHandler(async () => {
  throw AppError.notImplemented('Not implemented yet');
});

router.get('/', stub); // list products
router.get('/:id', stub); // fetch one product
router.post('/', stub); // create product
router.patch('/:id', stub); // update product
router.delete('/:id', stub); // delete product

export default router;
