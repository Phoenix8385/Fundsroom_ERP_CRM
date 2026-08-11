import { Role } from '@prisma/client';

// Roles come straight from the Prisma enum in schema.prisma, so the API and the
// database can never drift apart.
export { Role };

export const ROLES = Object.values(Role);

/** The authenticated principal attached to `req.user` by `authenticate()`. */
export interface AuthUser {
  userId: string;
  role: Role;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}
