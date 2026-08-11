import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import 'dotenv/config';

/**
 * Seeds one user per role for local development.
 *
 * Run with `npm run seed`. Safe to re-run: users are upserted by email, so the
 * passwords below are always restored to a known state.
 */

const SALT_ROUNDS = 10;

/** Development credentials — documented here and printed on every run. */
const SEED_USERS: ReadonlyArray<{
  name: string;
  email: string;
  password: string;
  role: Role;
}> = [
  { name: 'Admin User', email: 'admin@fundsroom.test', password: 'Admin@123', role: Role.ADMIN },
  { name: 'Sales User', email: 'sales@fundsroom.test', password: 'Sales@123', role: Role.SALES },
  {
    name: 'Warehouse User',
    email: 'warehouse@fundsroom.test',
    password: 'Ware@123',
    role: Role.WAREHOUSE,
  },
  {
    name: 'Accounts User',
    email: 'accounts@fundsroom.test',
    password: 'Acc@123',
    role: Role.ACCOUNTS,
  },
];

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DIRECT_DATABASE_URL / DATABASE_URL is not set — check your .env file');
  }

  if (connectionString.startsWith('prisma+postgres://')) {
    throw new Error(
      'Seeding needs a direct TCP connection. Set DIRECT_DATABASE_URL to the ' +
        'postgres:// URL printed by `npx prisma dev`.',
    );
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();

  try {
    for (const user of SEED_USERS) {
      const password = await bcrypt.hash(user.password, SALT_ROUNDS);

      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name, password, role: user.role },
        create: { name: user.name, email: user.email, password, role: user.role },
      });
    }

    console.log(`\nSeeded ${SEED_USERS.length} users:\n`);
    console.table(
      SEED_USERS.map(({ role, email, password }) => ({ role, email, password })),
    );
    console.log('These passwords are for local development only.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
