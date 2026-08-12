// Temporary end-to-end check of the challans router. Deleted after running.
// Mounts the REAL router + REAL global error handler, with authenticate faked.
import 'dotenv/config';
import express from 'express';
import type { AddressInfo } from 'net';
import { prisma } from './src/lib/prisma';
import { errorHandler } from './src/middleware/errorHandler';
import challansRouter from './src/routes/challans';

const PREFIX = 'ZZCH-';
const USER_ID = 'test-user-id';

const app = express();
app.use(express.json());
app.use('/challans', (req, _res, next) => {
  req.user = { userId: USER_ID, role: (req.headers['x-test-role'] as string) ?? 'ADMIN' } as never;
  next();
}, challansRouter);
app.use(errorHandler);

let base = '';
let failures = 0;

function check(label: string, condition: boolean, detail: unknown = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}`, typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
}

async function call(method: string, path: string, body?: unknown, role?: string) {
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (role) headers['x-test-role'] = role;
  const res = await fetch(`${base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function cleanup() {
  const cust = await prisma.customer.findMany({
    where: { name: { startsWith: PREFIX } }, select: { id: true },
  });
  const custIds = cust.map((c) => c.id);
  if (custIds.length) {
    await prisma.challan.deleteMany({ where: { customerId: { in: custIds } } });
  }
  const prods = await prisma.product.findMany({
    where: { sku: { startsWith: PREFIX } }, select: { id: true },
  });
  const prodIds = prods.map((p) => p.id);
  if (prodIds.length) {
    await prisma.stockMovement.deleteMany({ where: { productId: { in: prodIds } } });
    await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
  }
  if (custIds.length) await prisma.customer.deleteMany({ where: { id: { in: custIds } } });
  return custIds.length + prodIds.length;
}

async function makeProduct(sku: string, stock: number, price = 100) {
  return prisma.product.create({
    data: { name: `${PREFIX}${sku}`, sku: `${PREFIX}${sku}`, unitPrice: price, currentStock: stock },
  });
}

async function main() {
  await cleanup();

  const customer = await prisma.customer.create({
    data: { name: `${PREFIX}Buyer`, mobile: '9876543210', type: 'RETAIL' },
  });
  const widget = await makeProduct('WIDGET', 100, 149.5);
  const gadget = await makeProduct('GADGET', 8, 20);

  console.log('\n--- POST /challans ---');
  const created = await call('POST', '/challans', {
    customerId: customer.id,
    items: [{ productId: widget.id, quantity: 3 }, { productId: gadget.id, quantity: 2 }],
  });
  check('201 on create', created.status === 201, created);
  check('status DRAFT', created.body.status === 'DRAFT', created.body.status);
  check('challanNumber format CH-<year>-0000',
    new RegExp(`^CH-${new Date().getFullYear()}-\\d{4}$`).test(created.body.challanNumber),
    created.body.challanNumber);
  check('totalQuantity summed (3+2=5)', created.body.totalQuantity === 5, created.body.totalQuantity);
  check('two item rows created', created.body.items.length === 2, created.body.items.length);
  const wLine = created.body.items.find((i: any) => i.productId === widget.id);
  check('snapshots name/sku/unitPrice onto the line',
    wLine.productName === widget.name && wLine.sku === widget.sku && String(wLine.unitPrice) === '149.5',
    wLine);
  check('createdBy from req.user', created.body.createdBy === USER_ID, created.body.createdBy);
  const stockAfterDraft = await prisma.product.findUnique({ where: { id: widget.id } });
  check('no stock touched by DRAFT', stockAfterDraft?.currentStock === 100, stockAfterDraft?.currentStock);
  const draftId: string = created.body.id;

  const badCustomer = await call('POST', '/challans', {
    customerId: '00000000-0000-0000-0000-000000000000',
    items: [{ productId: widget.id, quantity: 1 }],
  });
  check('404 on unknown customer', badCustomer.status === 404, badCustomer.body);
  check('404 names the customerId', /00000000-0000-0000-0000-000000000000/.test(badCustomer.body.error), badCustomer.body.error);

  const badProducts = await call('POST', '/challans', {
    customerId: customer.id,
    items: [
      { productId: widget.id, quantity: 1 },
      { productId: '11111111-1111-1111-1111-111111111111', quantity: 1 },
      { productId: '22222222-2222-2222-2222-222222222222', quantity: 1 },
    ],
  });
  check('404 when a productId is unknown', badProducts.status === 404, badProducts.body);
  check('404 lists BOTH missing product ids',
    /11111111/.test(badProducts.body.error) && /22222222/.test(badProducts.body.error),
    badProducts.body.error);

  const noItems = await call('POST', '/challans', { customerId: customer.id, items: [] });
  check('400 on empty items array', noItems.status === 400, noItems.body);
  const badQty = await call('POST', '/challans', {
    customerId: customer.id, items: [{ productId: widget.id, quantity: 0 }],
  });
  check('400 on zero quantity', badQty.status === 400, badQty.body);

  console.log('\n--- snapshot immutability ---');
  await prisma.product.update({
    where: { id: widget.id }, data: { name: `${PREFIX}RENAMED`, unitPrice: 999.99 },
  });
  const refetched = await call('GET', `/challans/${draftId}`);
  const wLine2 = refetched.body.items.find((i: any) => i.productId === widget.id);
  check('line keeps the ORIGINAL name after product rename',
    wLine2.productName === `${PREFIX}WIDGET`, wLine2.productName);
  check('line keeps the ORIGINAL price after reprice',
    String(wLine2.unitPrice) === '149.5', wLine2.unitPrice);

  console.log('\n--- PUT /:id/confirm ---');
  const confirmed = await call('PUT', `/challans/${draftId}/confirm`);
  check('200 on confirm', confirmed.status === 200, confirmed);
  check('status CONFIRMED', confirmed.body.status === 'CONFIRMED', confirmed.body.status);
  const wAfter = await prisma.product.findUnique({ where: { id: widget.id } });
  const gAfter = await prisma.product.findUnique({ where: { id: gadget.id } });
  check('widget stock deducted 100 -> 97', wAfter?.currentStock === 97, wAfter?.currentStock);
  check('gadget stock deducted 8 -> 6', gAfter?.currentStock === 6, gAfter?.currentStock);
  const outMoves = await prisma.stockMovement.findMany({
    where: { productId: { in: [widget.id, gadget.id] }, type: 'OUT' },
  });
  check('one OUT movement per item', outMoves.length === 2, outMoves.length);
  check('movement reason names the challan',
    outMoves.every((m) => m.reason === `Challan ${created.body.challanNumber} confirmed`),
    outMoves.map((m) => m.reason));
  check('movement createdBy from req.user',
    outMoves.every((m) => m.createdBy === USER_ID), outMoves.map((m) => m.createdBy));

  const reconfirm = await call('PUT', `/challans/${draftId}/confirm`);
  check('409 confirming an already-CONFIRMED challan', reconfirm.status === 409, reconfirm);
  check('409 message reports current status',
    reconfirm.body.error === 'Challan is already CONFIRMED', reconfirm.body.error);

  const missingConfirm = await call('PUT', '/challans/00000000-0000-0000-0000-000000000000/confirm');
  check('404 confirming unknown challan', missingConfirm.status === 404, missingConfirm.body);

  console.log('\n--- confirm with insufficient stock (all shortages, full rollback) ---');
  const short = await call('POST', '/challans', {
    customerId: customer.id,
    items: [{ productId: widget.id, quantity: 5 }, { productId: gadget.id, quantity: 500 }],
  });
  const shortId: string = short.body.id;
  // Make BOTH lines short so we can prove every shortage is collected.
  await prisma.product.update({ where: { id: widget.id }, data: { currentStock: 1 } });
  const rejected = await call('PUT', `/challans/${shortId}/confirm`);
  check('409 on insufficient stock', rejected.status === 409, rejected.status);
  check('error message is "Insufficient stock"', rejected.body.error === 'Insufficient stock', rejected.body.error);
  check('shortages array present in the body', Array.isArray(rejected.body.shortages), rejected.body);
  check('BOTH short lines reported, not just the first',
    rejected.body.shortages?.length === 2, rejected.body.shortages);
  const wShort = rejected.body.shortages?.find((s: any) => s.productId === widget.id);
  // This challan was raised AFTER the rename above, so its line snapshot — and
  // therefore the shortage report — correctly carries the renamed value.
  check('shortage carries productId/productName/available/requested',
    wShort && wShort.productName === `${PREFIX}RENAMED` && wShort.available === 1 && wShort.requested === 5,
    wShort);
  const wRolled = await prisma.product.findUnique({ where: { id: widget.id } });
  check('stock NOT deducted after rejection (rolled back)', wRolled?.currentStock === 1, wRolled?.currentStock);
  const stillDraft = await prisma.challan.findUnique({ where: { id: shortId } });
  check('challan still DRAFT after rejection', stillDraft?.status === 'DRAFT', stillDraft?.status);
  const noNewMoves = await prisma.stockMovement.count({
    where: { reason: { contains: short.body.challanNumber } },
  });
  check('no movements written for the rejected confirm', noNewMoves === 0, noNewMoves);

  console.log('\n--- duplicate productId across lines is aggregated ---');
  await prisma.product.update({ where: { id: widget.id }, data: { currentStock: 10 } });
  const dupLines = await call('POST', '/challans', {
    customerId: customer.id,
    items: [{ productId: widget.id, quantity: 6 }, { productId: widget.id, quantity: 6 }],
  });
  const dupConfirm = await call('PUT', `/challans/${dupLines.body.id}/confirm`);
  check('409: 6+6 checked against stock 10 as 12, not twice as 6',
    dupConfirm.status === 409, dupConfirm.body);
  check('aggregated shortage reports requested 12',
    dupConfirm.body.shortages?.[0]?.requested === 12, dupConfirm.body.shortages);
  const dupStock = await prisma.product.findUnique({ where: { id: widget.id } });
  check('stock untouched by the rejected duplicate-line challan', dupStock?.currentStock === 10, dupStock?.currentStock);

  console.log('\n--- PUT /:id/cancel ---');
  const cancelConfirmed = await call('PUT', `/challans/${draftId}/cancel`);
  check('200 cancelling a CONFIRMED challan', cancelConfirmed.status === 200, cancelConfirmed.status);
  check('status CANCELLED', cancelConfirmed.body.status === 'CANCELLED', cancelConfirmed.body.status);
  const gRestocked = await prisma.product.findUnique({ where: { id: gadget.id } });
  check('gadget restocked 6 -> 8 on cancel', gRestocked?.currentStock === 8, gRestocked?.currentStock);
  const inMoves = await prisma.stockMovement.findMany({
    where: { type: 'IN', reason: `Challan ${created.body.challanNumber} cancelled` },
  });
  check('IN movement per item on restock', inMoves.length === 2, inMoves.length);

  const recancel = await call('PUT', `/challans/${draftId}/cancel`);
  check('409 cancelling an already-CANCELLED challan', recancel.status === 409, recancel.status);
  check('409 message is "Challan is already cancelled"',
    recancel.body.error === 'Challan is already cancelled', recancel.body.error);

  const confirmCancelled = await call('PUT', `/challans/${draftId}/confirm`);
  check('409 confirming a CANCELLED challan', confirmCancelled.status === 409, confirmCancelled.body.error);

  const draftToCancel = await call('POST', '/challans', {
    customerId: customer.id, items: [{ productId: gadget.id, quantity: 2 }],
  });
  const beforeDraftCancel = await prisma.product.findUnique({ where: { id: gadget.id } });
  const cancelDraft = await call('PUT', `/challans/${draftToCancel.body.id}/cancel`);
  const afterDraftCancel = await prisma.product.findUnique({ where: { id: gadget.id } });
  check('200 cancelling a DRAFT', cancelDraft.status === 200, cancelDraft.status);
  check('DRAFT cancel does NOT restock (nothing was deducted)',
    beforeDraftCancel?.currentStock === afterDraftCancel?.currentStock, afterDraftCancel?.currentStock);
  const draftCancelMoves = await prisma.stockMovement.count({
    where: { reason: { contains: draftToCancel.body.challanNumber } },
  });
  check('DRAFT cancel writes no movements', draftCancelMoves === 0, draftCancelMoves);

  console.log('\n--- concurrency: two parallel confirms of the SAME challan ---');
  await prisma.product.update({ where: { id: widget.id }, data: { currentStock: 10 } });
  const raceChallan = await call('POST', '/challans', {
    customerId: customer.id, items: [{ productId: widget.id, quantity: 8 }],
  });
  const raceResults = await Promise.all([
    call('PUT', `/challans/${raceChallan.body.id}/confirm`),
    call('PUT', `/challans/${raceChallan.body.id}/confirm`),
  ]);
  const okConfirms = raceResults.filter((r) => r.status === 200).length;
  const raceStock = await prisma.product.findUnique({ where: { id: widget.id } });
  check('exactly one confirm wins', okConfirms === 1, raceResults.map((r) => r.status));
  check('stock deducted ONCE (10 - 8 = 2), not twice',
    raceStock?.currentStock === 2, raceStock?.currentStock);
  const raceMoves = await prisma.stockMovement.count({
    where: { reason: { contains: raceChallan.body.challanNumber } },
  });
  check('exactly one OUT movement written', raceMoves === 1, raceMoves);

  console.log('\n--- concurrency: parallel creates racing for a challan number ---');
  const burst = await Promise.all(
    Array.from({ length: 5 }, () =>
      call('POST', '/challans', {
        customerId: customer.id, items: [{ productId: gadget.id, quantity: 1 }],
      }),
    ),
  );
  const burstOk = burst.filter((r) => r.status === 201);
  const numbers = burstOk.map((r) => r.body.challanNumber);
  check('all issued numbers are unique', new Set(numbers).size === numbers.length, numbers);
  console.log(`  note: ${burstOk.length}/5 parallel creates succeeded; statuses=${JSON.stringify(burst.map((r) => r.status))}`);

  console.log('\n--- GET /challans ---');
  const list = await call('GET', '/challans?pageSize=2');
  check('envelope { data, total, page, pageSize }',
    Array.isArray(list.body.data) && typeof list.body.total === 'number'
    && list.body.page === 1 && list.body.pageSize === 2, Object.keys(list.body));
  check('take honoured', list.body.data.length === 2, list.body.data.length);
  check('customer included as id/name only',
    list.body.data[0].customer && 'id' in list.body.data[0].customer
    && 'name' in list.body.data[0].customer && !('mobile' in list.body.data[0].customer),
    list.body.data[0].customer);

  const byStatus = await call('GET', `/challans?status=CANCELLED&customerId=${customer.id}`);
  check('status filter returns only CANCELLED',
    byStatus.body.data.every((c: any) => c.status === 'CANCELLED'), byStatus.body.data.map((c: any) => c.status));
  const byCustomer = await call('GET', `/challans?customerId=${customer.id}`);
  check('customerId filter applied',
    byCustomer.body.data.every((c: any) => c.customer.id === customer.id), byCustomer.body.total);
  const badStatus = await call('GET', '/challans?status=NOPE');
  check('400 on invalid status enum', badStatus.status === 400, badStatus.body);
  const overCap = await call('GET', '/challans?pageSize=500');
  check('400 when pageSize exceeds 100', overCap.status === 400, overCap.body);

  console.log('\n--- GET /challans/:id ---');
  const one = await call('GET', `/challans/${draftId}`);
  check('200 with items + full customer',
    one.status === 200 && Array.isArray(one.body.items) && one.body.customer.mobile === '9876543210',
    one.body.customer);
  const oneMissing = await call('GET', '/challans/00000000-0000-0000-0000-000000000000');
  check('404 on unknown id', oneMissing.status === 404, oneMissing.body);

  console.log('\n--- role guards ---');
  const whGet = await call('GET', '/challans', undefined, 'WAREHOUSE');
  check('WAREHOUSE can read the list', whGet.status === 200, whGet.status);
  const whGetOne = await call('GET', `/challans/${draftId}`, undefined, 'WAREHOUSE');
  check('WAREHOUSE can read one challan', whGetOne.status === 200, whGetOne.status);
  const acctGet = await call('GET', '/challans', undefined, 'ACCOUNTS');
  check('ACCOUNTS can read the list', acctGet.status === 200, acctGet.status);
  const whPost = await call('POST', '/challans', {
    customerId: customer.id, items: [{ productId: gadget.id, quantity: 1 }],
  }, 'WAREHOUSE');
  check('WAREHOUSE cannot create (403)', whPost.status === 403, whPost.status);
  const whConfirm = await call('PUT', `/challans/${draftId}/confirm`, undefined, 'WAREHOUSE');
  check('WAREHOUSE cannot confirm (403)', whConfirm.status === 403, whConfirm.status);
  const whCancel = await call('PUT', `/challans/${draftId}/cancel`, undefined, 'WAREHOUSE');
  check('WAREHOUSE cannot cancel (403)', whCancel.status === 403, whCancel.status);
}

const server = app.listen(0, async () => {
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await main();
  } catch (err) {
    failures += 1;
    console.error('\nTHREW:', err);
  } finally {
    const removed = await cleanup();
    console.log(`\ncleaned up ${removed} test row group(s)`);
    console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
    await prisma.$disconnect();
    server.close();
  }
});
