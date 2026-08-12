/**
 * Phase 9 end-to-end checklist, driven entirely through the HTTP API.
 *
 *   npm run e2e                                  # against localhost:4000
 *   API_URL=https://api.example.com npm run e2e  # against the deployed API
 *
 * Nothing here touches Prisma, so the same run works from a laptop against a
 * deployed server where the database is not directly reachable — which is the
 * point: the post-deploy run is the one that catches env-var and CORS faults.
 *
 * Every record it creates is prefixed with a run-specific tag so residue is
 * identifiable; `npm run e2e:clean` removes it locally.
 */

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/** Origin the browser app will call from — used for the CORS preflight check. */
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

export const TAG = `E2E-${Date.now().toString(36).toUpperCase()}`;

const SEED_USERS = {
  ADMIN: { email: 'admin@fundsroom.test', password: 'Admin@123' },
  SALES: { email: 'sales@fundsroom.test', password: 'Sales@123' },
  WAREHOUSE: { email: 'warehouse@fundsroom.test', password: 'Ware@123' },
  ACCOUNTS: { email: 'accounts@fundsroom.test', password: 'Acc@123' },
} as const;

type RoleName = keyof typeof SEED_USERS;

const ROLES = Object.keys(SEED_USERS) as RoleName[];

/* --- tiny test harness --------------------------------------------------- */

interface Result {
  section: string;
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
let currentSection = '';

function section(name: string) {
  currentSection = name;
  console.log(`\n${name}`);
}

function check(name: string, ok: boolean, detail: unknown = '') {
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
  results.push({ section: currentSection, name, ok, detail: text });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !text ? '' : `  → ${text}`}`);
}

/* --- HTTP ---------------------------------------------------------------- */

interface Res<T> {
  status: number;
  body: T;
}

async function call<T = any>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<Res<T>> {
  const headers: Record<string, string> = {};

  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const text = await res.text();
  let body: unknown;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body is itself a finding — an HTML error page from a proxy,
    // for instance — so keep the raw text rather than throwing here.
    body = { error: `non-JSON response: ${text.slice(0, 120)}` };
  }

  return { status: res.status, body: body as T };
}

/** Reads a JWT payload without verifying it — just to confirm the role claim. */
function decodeRole(token: string): string | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

/* --- the checklist ------------------------------------------------------- */

const tokens = {} as Record<RoleName, string>;

async function testAuth() {
  section('1. Log in as each of the 4 roles');

  for (const role of ROLES) {
    const { status, body } = await call('POST', '/auth/login', { body: SEED_USERS[role] });

    check(`${role} logs in`, status === 200 && Boolean(body.token), { status, body });

    if (body?.token) {
      tokens[role] = body.token;
      check(`${role} token carries role=${role}`, decodeRole(body.token) === role, decodeRole(body.token));
      check(`${role} response omits the password hash`, !('password' in (body ?? {})), Object.keys(body ?? {}));
    }
  }

  const bad = await call('POST', '/auth/login', {
    body: { email: SEED_USERS.ADMIN.email, password: 'wrong-password' },
  });
  check('wrong password → 401', bad.status === 401, bad);
  check('401 message is readable, not a stack trace',
    typeof bad.body?.error === 'string' && !/at \w+ \(/.test(bad.body.error), bad.body);

  const noToken = await call('GET', '/customers');
  check('no token → 401', noToken.status === 401, noToken);
}

/**
 * The "wrong role's token via Postman" bullet, automated across every guarded
 * route. Bodies are deliberately empty: requireRole runs before validation, so
 * a permitted role answers 400 and a blocked role answers 403 — which proves
 * the guard fired rather than the handler.
 */
async function testRoleMatrix(ids: { customerId: string; productId: string; challanId: string }) {
  section('2. Wrong-role token on protected routes → 403, never 200');

  const routes: Array<{
    label: string;
    method: string;
    path: string;
    allowed: RoleName[];
  }> = [
    { label: 'GET  /customers', method: 'GET', path: '/customers', allowed: ROLES },
    { label: 'GET  /customers/:id', method: 'GET', path: `/customers/${ids.customerId}`, allowed: ROLES },
    { label: 'POST /customers', method: 'POST', path: '/customers', allowed: ['ADMIN', 'SALES'] },
    { label: 'PUT  /customers/:id', method: 'PUT', path: `/customers/${ids.customerId}`, allowed: ['ADMIN', 'SALES'] },
    { label: 'POST /customers/:id/notes', method: 'POST', path: `/customers/${ids.customerId}/notes`, allowed: ROLES },
    { label: 'GET  /products', method: 'GET', path: '/products', allowed: ROLES },
    { label: 'GET  /products/:id/stock-log', method: 'GET', path: `/products/${ids.productId}/stock-log`, allowed: ROLES },
    { label: 'POST /products', method: 'POST', path: '/products', allowed: ['ADMIN', 'WAREHOUSE'] },
    { label: 'PUT  /products/:id', method: 'PUT', path: `/products/${ids.productId}`, allowed: ['ADMIN', 'WAREHOUSE'] },
    { label: 'POST /products/:id/adjust-stock', method: 'POST', path: `/products/${ids.productId}/adjust-stock`, allowed: ['ADMIN', 'WAREHOUSE'] },
    { label: 'GET  /challans', method: 'GET', path: '/challans', allowed: ROLES },
    { label: 'POST /challans', method: 'POST', path: '/challans', allowed: ['ADMIN', 'SALES'] },
    { label: 'PUT  /challans/:id/confirm', method: 'PUT', path: `/challans/${ids.challanId}/confirm`, allowed: ['ADMIN', 'SALES'] },
    { label: 'PUT  /challans/:id/cancel', method: 'PUT', path: `/challans/${ids.challanId}/cancel`, allowed: ['ADMIN', 'SALES'] },
  ];

  for (const route of routes) {
    const blocked = ROLES.filter((role) => !route.allowed.includes(role));

    for (const role of blocked) {
      const isRead = route.method === 'GET';
      const res = await call(route.method, route.path, {
        token: tokens[role],
        body: isRead ? undefined : {},
      });

      check(`${route.label} as ${role} → 403`, res.status === 403, { got: res.status, body: res.body });
    }

    for (const role of route.allowed) {
      const isRead = route.method === 'GET';
      const res = await call(route.method, route.path, {
        token: tokens[role],
        body: isRead ? undefined : {},
      });

      // Permitted roles must NOT be turned away by the guard.
      check(`${route.label} as ${role} → not 403`, res.status !== 403, { got: res.status });
    }
  }
}

async function testCustomers() {
  section('3. Create a customer, add a note, edit it, search for it');

  const created = await call('POST', '/customers', {
    token: tokens.SALES,
    body: { name: `${TAG} Ravi Kumar`, mobile: '9876543210', type: 'WHOLESALE', businessName: `${TAG} Traders` },
  });
  check('SALES creates a customer → 201', created.status === 201, created);

  const customerId = created.body?.id as string;

  if (!customerId) throw new Error('cannot continue without a customer id');

  const badMobile = await call('POST', '/customers', {
    token: tokens.SALES,
    body: { name: `${TAG} Bad`, mobile: '12345', type: 'RETAIL' },
  });
  check('invalid mobile → 400 with a readable message',
    badMobile.status === 400 && /mobile/i.test(String(badMobile.body?.error)), badMobile.body);

  // Notes carry no requireRole — prove it with a role that cannot edit customers.
  const note = await call('POST', `/customers/${customerId}/notes`, {
    token: tokens.WAREHOUSE,
    body: { text: `${TAG} Called about the pending order.` },
  });
  check('WAREHOUSE (no write access) can add a follow-up note → 201', note.status === 201, note);

  const edited = await call('PUT', `/customers/${customerId}`, {
    token: tokens.SALES,
    body: { status: 'ACTIVE', businessName: `${TAG} Traders Pvt Ltd` },
  });
  check('SALES edits the customer → 200', edited.status === 200, edited.status);
  check('edit persisted', edited.body?.businessName === `${TAG} Traders Pvt Ltd`, edited.body?.businessName);

  const detail = await call('GET', `/customers/${customerId}`, { token: tokens.ACCOUNTS });
  check('ACCOUNTS can read the detail', detail.status === 200, detail.status);
  check('detail includes the note', detail.body?.notes?.some((n: any) => n.text.includes(TAG)), detail.body?.notes?.length);
  check('detail includes a challans array', Array.isArray(detail.body?.challans), typeof detail.body?.challans);

  const search = await call('GET', `/customers?search=${encodeURIComponent(TAG.toLowerCase())}`, {
    token: tokens.ACCOUNTS,
  });
  check('case-insensitive search finds it',
    search.body?.data?.some((c: any) => c.id === customerId), { total: search.body?.total });

  const filtered = await call('GET', '/customers?status=ACTIVE&type=WHOLESALE&pageSize=100', { token: tokens.SALES });
  check('status + type filters return it',
    filtered.body?.data?.some((c: any) => c.id === customerId), { total: filtered.body?.total });

  const capped = await call('GET', '/customers?pageSize=500', { token: tokens.SALES });
  check('pageSize above 100 → 400', capped.status === 400, capped.body);

  return customerId;
}

async function testProducts() {
  section('4. Add a product, adjust stock, check the stock log');

  const created = await call('POST', '/products', {
    token: tokens.WAREHOUSE,
    body: { name: `${TAG} Cabinet Handles`, sku: `${TAG}-1042`, unitPrice: 149.5, currentStock: 40, minStockAlert: 20, category: 'Hardware' },
  });
  check('WAREHOUSE creates a product → 201', created.status === 201, created);

  const productId = created.body?.id as string;

  if (!productId) throw new Error('cannot continue without a product id');

  check('SKU stored uppercase', created.body?.sku === `${TAG}-1042`.toUpperCase(), created.body?.sku);

  const dup = await call('POST', '/products', {
    token: tokens.WAREHOUSE,
    body: { name: `${TAG} Dup`, sku: `${TAG}-1042`.toLowerCase(), unitPrice: 10 },
  });
  check('duplicate SKU (different case) → 409', dup.status === 409, dup);

  const before = created.body.currentStock as number;

  const adjustIn = await call('POST', `/products/${productId}/adjust-stock`, {
    token: tokens.WAREHOUSE,
    body: { quantityChanged: 15, type: 'IN', reason: `${TAG} restock from supplier` },
  });
  check('stock IN adjustment → 201', adjustIn.status === 201, adjustIn.status);
  check(`stock rose ${before} → ${before + 15}`, adjustIn.body?.product?.currentStock === before + 15, adjustIn.body?.product?.currentStock);

  const adjustOut = await call('POST', `/products/${productId}/adjust-stock`, {
    token: tokens.WAREHOUSE,
    body: { quantityChanged: 5, type: 'OUT', reason: `${TAG} damaged in transit` },
  });
  check(`stock fell ${before + 15} → ${before + 10}`, adjustOut.body?.product?.currentStock === before + 10, adjustOut.body?.product?.currentStock);

  const oversell = await call('POST', `/products/${productId}/adjust-stock`, {
    token: tokens.WAREHOUSE,
    body: { quantityChanged: 99999, type: 'OUT', reason: `${TAG} oversell attempt` },
  });
  check('OUT beyond available → 409', oversell.status === 409, oversell.status);
  check('409 names the available stock', new RegExp(String(before + 10)).test(String(oversell.body?.error)), oversell.body?.error);

  const afterReject = await call('GET', `/products/${productId}`, { token: tokens.WAREHOUSE });
  check('stock untouched after the rejected adjustment', afterReject.body?.currentStock === before + 10, afterReject.body?.currentStock);

  // Stock log is readable by every role, including the read-only one.
  const log = await call('GET', `/products/${productId}/stock-log`, { token: tokens.ACCOUNTS });
  check('ACCOUNTS can read the stock log → 200', log.status === 200, log.status);
  check('log records both adjustments', log.body?.total === 2, log.body?.total);
  check('log is newest-first',
    log.body?.data?.[0]?.reason?.includes('damaged in transit'), log.body?.data?.[0]?.reason);
  check('log omits the rejected adjustment',
    !log.body?.data?.some((m: any) => m.reason.includes('oversell attempt')), log.body?.total);

  const lowStock = await call('GET', `/products?lowStockOnly=true&search=${TAG}`, { token: tokens.SALES });
  check('lowStockOnly excludes a healthy product', !lowStock.body?.data?.some((p: any) => p.id === productId), lowStock.body?.total);

  return { productId, stock: before + 10 };
}

async function testChallanHappyPath(customerId: string, productId: string, stock: number) {
  section('5. Draft challan → confirm → stock decreases, StockMovement written');

  const qty = 4;

  const draft = await call('POST', '/challans', {
    token: tokens.SALES,
    body: { customerId, items: [{ productId, quantity: qty }] },
  });
  check('SALES creates a draft challan → 201', draft.status === 201, draft);
  check('status is DRAFT', draft.body?.status === 'DRAFT', draft.body?.status);
  check('challan number looks like CH-<year>-0000',
    /^CH-\d{4}-\d{4}$/.test(String(draft.body?.challanNumber)), draft.body?.challanNumber);
  check('line snapshots name/sku/price',
    draft.body?.items?.[0]?.productName && draft.body?.items?.[0]?.sku && draft.body?.items?.[0]?.unitPrice,
    draft.body?.items?.[0]);

  const challanId = draft.body?.id as string;
  const challanNumber = draft.body?.challanNumber as string;

  const stillUnchanged = await call('GET', `/products/${productId}`, { token: tokens.SALES });
  check('DRAFT does not move stock', stillUnchanged.body?.currentStock === stock, stillUnchanged.body?.currentStock);

  const confirmed = await call('PUT', `/challans/${challanId}/confirm`, { token: tokens.SALES });
  check('confirm → 200', confirmed.status === 200, confirmed);
  check('status is CONFIRMED', confirmed.body?.status === 'CONFIRMED', confirmed.body?.status);

  const afterConfirm = await call('GET', `/products/${productId}`, { token: tokens.SALES });
  check(`stock decreased ${stock} → ${stock - qty}`, afterConfirm.body?.currentStock === stock - qty, afterConfirm.body?.currentStock);

  const log = await call('GET', `/products/${productId}/stock-log`, { token: tokens.WAREHOUSE });
  const outMove = log.body?.data?.find((m: any) => m.reason === `Challan ${challanNumber} confirmed`);
  check('a StockMovement row exists for the confirm', Boolean(outMove), log.body?.data?.map((m: any) => m.reason));
  check('movement is type OUT with the right quantity',
    outMove?.type === 'OUT' && outMove?.quantityChanged === qty, outMove);

  const reconfirm = await call('PUT', `/challans/${challanId}/confirm`, { token: tokens.SALES });
  check('confirming twice → 409', reconfirm.status === 409, reconfirm.status);
  check('409 says it is already confirmed', /already CONFIRMED/i.test(String(reconfirm.body?.error)), reconfirm.body?.error);

  return { challanId, challanNumber, qty, stockAfterConfirm: stock - qty };
}

async function testChallanOverStock(customerId: string, productId: string, available: number) {
  section('6. Confirm a challan exceeding stock → rejected cleanly, stock untouched');

  const asked = available + 50;

  const draft = await call('POST', '/challans', {
    token: tokens.SALES,
    body: { customerId, items: [{ productId, quantity: asked }] },
  });
  check('over-stock draft is still accepted (stock moves on confirm)', draft.status === 201, draft.status);

  const challanId = draft.body?.id as string;

  const confirm = await call('PUT', `/challans/${challanId}/confirm`, { token: tokens.SALES });
  check('confirm → 409', confirm.status === 409, confirm.status);
  check('error reads "Insufficient stock"', confirm.body?.error === 'Insufficient stock', confirm.body?.error);
  check('body carries a shortages array', Array.isArray(confirm.body?.shortages), confirm.body);

  const shortage = confirm.body?.shortages?.[0];
  check('shortage names the product and both numbers',
    shortage?.productName && shortage?.available === available && shortage?.requested === asked, shortage);
  check('error is readable, not a stack trace or Prisma dump',
    !/PrismaClient|at \w+ \(|node_modules/.test(JSON.stringify(confirm.body)), confirm.body);

  const after = await call('GET', `/products/${productId}`, { token: tokens.SALES });
  check('stock untouched after rejection', after.body?.currentStock === available, after.body?.currentStock);

  const state = await call('GET', `/challans/${challanId}`, { token: tokens.SALES });
  check('challan is still DRAFT, not half-confirmed', state.body?.status === 'DRAFT', state.body?.status);

  const log = await call('GET', `/products/${productId}/stock-log`, { token: tokens.WAREHOUSE });
  check('no StockMovement written for the rejected confirm',
    !log.body?.data?.some((m: any) => m.reason === `Challan ${state.body?.challanNumber} confirmed`),
    log.body?.total);
}

async function testChallanCancel(
  productId: string,
  confirmed: { challanId: string; challanNumber: string; qty: number; stockAfterConfirm: number },
) {
  section('7. Cancel a confirmed challan → stock restored');

  const cancel = await call('PUT', `/challans/${confirmed.challanId}/cancel`, { token: tokens.SALES });
  check('cancel → 200', cancel.status === 200, cancel.status);
  check('status is CANCELLED', cancel.body?.status === 'CANCELLED', cancel.body?.status);

  const after = await call('GET', `/products/${productId}`, { token: tokens.SALES });
  check(`stock restored ${confirmed.stockAfterConfirm} → ${confirmed.stockAfterConfirm + confirmed.qty}`,
    after.body?.currentStock === confirmed.stockAfterConfirm + confirmed.qty, after.body?.currentStock);

  const log = await call('GET', `/products/${productId}/stock-log`, { token: tokens.WAREHOUSE });
  const inMove = log.body?.data?.find((m: any) => m.reason === `Challan ${confirmed.challanNumber} cancelled`);
  check('an IN StockMovement records the restock',
    inMove?.type === 'IN' && inMove?.quantityChanged === confirmed.qty, inMove);

  const recancel = await call('PUT', `/challans/${confirmed.challanId}/cancel`, { token: tokens.SALES });
  check('cancelling twice → 409', recancel.status === 409, recancel.status);
  check('409 says it is already cancelled', /already cancelled/i.test(String(recancel.body?.error)), recancel.body?.error);
}

/** Faults that only appear once the API is behind a real origin and env config. */
async function testDeploymentSanity() {
  section('8. Deployment sanity (env + CORS)');

  const health = await call('GET', '/health');
  check('GET /health → 200', health.status === 200, health);

  const preflight = await fetch(`${API}/customers`, {
    method: 'OPTIONS',
    headers: {
      Origin: WEB_ORIGIN,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  const allowOrigin = preflight.headers.get('access-control-allow-origin');
  check(`CORS preflight from ${WEB_ORIGIN} is allowed`,
    preflight.status < 400 && (allowOrigin === '*' || allowOrigin === WEB_ORIGIN),
    { status: preflight.status, allowOrigin });

  const withOrigin = await fetch(`${API}/health`, { headers: { Origin: WEB_ORIGIN } });
  check('actual request echoes an allow-origin header',
    Boolean(withOrigin.headers.get('access-control-allow-origin')),
    withOrigin.headers.get('access-control-allow-origin'));

  const missing = await call('GET', '/definitely-not-a-route', { token: tokens.ADMIN });
  check('unknown route → 404 JSON, not an HTML error page',
    missing.status === 404 && typeof missing.body?.error === 'string', missing.body);

  check('JWT_SECRET is set on the server (a login succeeded)', Boolean(tokens.ADMIN),
    tokens.ADMIN ? 'yes' : 'no token was ever issued');
}

/* --- runner -------------------------------------------------------------- */

async function main() {
  console.log(`\nPhase 9 end-to-end run`);
  console.log(`  API:  ${API}`);
  console.log(`  tag:  ${TAG}   (every record created is prefixed with this)`);

  const reachable = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);

  if (!reachable) {
    console.error(`\nCannot reach ${API}/health — is the API running?`);
    process.exit(2);
  }

  await testAuth();

  // /health answers without touching the database, so a reachable API proves
  // very little on its own. If no role could log in, stop here and say why
  // rather than cascading "missing Authorization header" through every check.
  const missing = ROLES.filter((role) => !tokens[role]);

  if (missing.length > 0) {
    console.error(
      `\nCould not log in as: ${missing.join(', ')}.` +
        `\nThe API is reachable but authentication failed — usually one of:` +
        `\n  • the database is down or unreachable from the API` +
        `\n  • the seed has not been run there (npm run seed)` +
        `\n  • JWT_SECRET is unset in that environment\n`,
    );
    process.exit(2);
  }

  const customerId = await testCustomers();
  const { productId, stock } = await testProducts();

  const confirmed = await testChallanHappyPath(customerId, productId, stock);
  await testChallanOverStock(customerId, productId, confirmed.stockAfterConfirm);
  await testChallanCancel(productId, confirmed);

  // Needs real ids, so it runs after the records exist.
  await testRoleMatrix({ customerId, productId, challanId: confirmed.challanId });

  await testDeploymentSanity();

  /* --- report --- */

  const failed = results.filter((r) => !r.ok);

  console.log('\n' + '─'.repeat(64));
  console.log(`${results.length - failed.length}/${results.length} checks passed`);

  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  [${f.section}] ${f.name}  → ${f.detail}`);
  }

  console.log(`\nRecords created under tag ${TAG}. Remove them with: npm run e2e:clean`);
  console.log('─'.repeat(64) + '\n');

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nRun aborted:', err);
  process.exit(2);
});
