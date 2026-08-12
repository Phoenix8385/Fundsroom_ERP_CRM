import type { Role } from '../types/api';

/**
 * Mirror of the guards enforced in backend/src/routes.
 *
 * This decides what the UI *offers*, never what it *allows* — the server is the
 * only authority. Keep each entry in step with the matching requireRole(...)
 * call, or the UI will show a button that answers 403.
 */

/** Every authenticated role can read every section. */
export const canViewCustomers = (): boolean => true;
export const canViewProducts = (): boolean => true;
export const canViewChallans = (): boolean => true;

/** customers.ts — POST / and PUT|PATCH /:id */
export function canWriteCustomers(role: Role): boolean {
  return role === 'ADMIN' || role === 'SALES';
}

/** customers.ts — POST /:id/notes carries no requireRole at all. */
export const canAddCustomerNote = (): boolean => true;

/** products.ts — POST /, PUT|PATCH /:id, POST /:id/adjust-stock */
export function canWriteProducts(role: Role): boolean {
  return role === 'ADMIN' || role === 'WAREHOUSE';
}

/** challans.ts — POST /, PUT /:id/confirm, PUT /:id/cancel */
export function canWriteChallans(role: Role): boolean {
  return role === 'ADMIN' || role === 'SALES';
}

/** True for a role with no write access anywhere — Accounts, by design. */
export function isReadOnly(role: Role): boolean {
  return !canWriteCustomers(role) && !canWriteProducts(role) && !canWriteChallans(role);
}
