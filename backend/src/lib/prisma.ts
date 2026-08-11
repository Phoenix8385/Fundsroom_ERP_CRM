import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient.
 *
 * ts-node-dev re-executes modules on every reload, and each `new PrismaClient()`
 * opens its own connection pool — so in development the instance is cached on
 * globalThis and reused across reloads. In production the module is evaluated
 * once, so the cache is skipped.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  __prisma__?: PrismaClient;
};

/**
 * Prisma 7 requires an explicit driver adapter, and every driver adapter speaks
 * raw Postgres over TCP. `DATABASE_URL` may be a `prisma+postgres://` URL — that
 * is the HTTP protocol used by Migrate and the local `prisma dev` server, which
 * no adapter can open — so the runtime client reads DIRECT_DATABASE_URL first.
 */
function resolveConnectionString(): string {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DIRECT_DATABASE_URL / DATABASE_URL is not set — check your .env file');
  }

  if (connectionString.startsWith('prisma+postgres://')) {
    throw new Error(
      'Prisma Client needs a direct TCP connection, but the configured URL uses the ' +
        'prisma+postgres:// protocol. Set DIRECT_DATABASE_URL to the postgres:// URL ' +
        '(run `npx prisma dev` and use the TCP URL it prints).',
    );
  }

  return connectionString;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: resolveConnectionString() });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.__prisma__ ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma__ = prisma;
}

export default prisma;
