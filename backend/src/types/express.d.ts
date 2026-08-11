import type { AuthUser } from './auth';

// Augments Express's Request so `req.user` is properly typed everywhere,
// rather than being cast with `req.user as any` at each use site.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
