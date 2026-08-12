/**
 * Removes everything the Phase 9 run created.
 *
 *   npm run e2e:clean
 *
 * Talks to the database directly, because the API has no delete route — so this
 * only works where DIRECT_DATABASE_URL is reachable (i.e. locally). After a run
 * against a deployed API, clean that environment from a shell that can see its
 * database.
 *
 * Matches on the `E2E-` prefix the run stamps onto every record, plus the
 * debug prefixes left by earlier phases.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const PREFIXES = ['E2E-', 'ZZ'];
const DEBUG_AUTHORS = ['seq-dbg', 'dbg', 'test-user-id'];

async function main() {
  const startsWith = PREFIXES.map((prefix) => ({ startsWith: prefix }));

  const customers = await prisma.customer.findMany({
    where: { OR: startsWith.map((name) => ({ name })) },
    select: { id: true },
  });

  const products = await prisma.product.findMany({
    where: { OR: startsWith.map((sku) => ({ sku })) },
    select: { id: true },
  });

  const customerIds = customers.map((c) => c.id);
  const productIds = products.map((p) => p.id);

  // Order matters: challans reference customers with onDelete: Restrict, and
  // stock movements reference products the same way.
  const challans = customerIds.length
    ? await prisma.challan.deleteMany({ where: { customerId: { in: customerIds } } })
    : { count: 0 };

  const movements = await prisma.stockMovement.deleteMany({
    where: {
      OR: [
        ...(productIds.length ? [{ productId: { in: productIds } }] : []),
        { createdBy: { in: DEBUG_AUTHORS } },
        { reason: { startsWith: 'E2E-' } },
      ],
    },
  });

  const notes = customerIds.length
    ? await prisma.note.deleteMany({ where: { customerId: { in: customerIds } } })
    : { count: 0 };

  const removedProducts = productIds.length
    ? await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    : { count: 0 };

  const removedCustomers = customerIds.length
    ? await prisma.customer.deleteMany({ where: { id: { in: customerIds } } })
    : { count: 0 };

  console.table({
    challans: challans.count,
    stockMovements: movements.count,
    notes: notes.count,
    products: removedProducts.count,
    customers: removedCustomers.count,
  });
}

main()
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
