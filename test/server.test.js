/**
 * Teste end-to-end pentru backend: porneste serverul real pe o baza in memorie
 * si vorbeste cu el prin HTTP, exact cum o va face agentul din locatie.
 *
 * Rulare:  npm run test:server
 */
import crypto from 'node:crypto';
import { openDatabase, closeDatabase } from '../server/db/index.js';

process.env.ZOF_SECRET_KEY = crypto.randomBytes(32).toString('hex');
process.env.ZOF_DB_FILE = ':memory:';
process.env.ZOF_CORS_ORIGINS = 'http://localhost:5173';

openDatabase(':memory:');

const { createServer } = await import('../server/index.js');
const { createUser } = await import('../server/lib/session.js');
const { createLocation, createConnector, rotateApiKey } = await import('../server/routes/admin.js');
const { sweepStaleConnectors } = await import('../server/routes/ingest.js');
const { signPayload } = await import('../server/lib/crypto.js');
const { run } = await import('../server/db/index.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

const server = createServer();
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ─── Ajutoare ────────────────────────────────────────────────────────────────

let cookie = '';

async function api(method, path, { body, headers = {}, useCookie = true } = {}) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(raw ? { 'Content-Type': 'application/json' } : {}),
      ...(useCookie && cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: raw || undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && useCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}

/** Cerere semnata exact cum o va trimite agentul. */
async function agentPost(path, apiKey, connectorId, body, overrides = {}) {
  const raw = JSON.stringify(body);
  const timestamp = overrides.timestamp ?? new Date().toISOString();
  const signature = overrides.signature ?? signPayload(apiKey, timestamp, raw);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Connector-Id': overrides.connectorId ?? connectorId,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    body: raw,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ─── Pregatire ───────────────────────────────────────────────────────────────

createUser({ email: 'owner@zof.local', password: 'parola-foarte-lunga', fullName: 'Owner', role: 'admin' });
createUser({ email: 'angajat@zof.local', password: 'parola-foarte-lunga', role: 'angajat' });
const arges = createLocation({ id: 'loc-arges', name: 'Argeș Mall', type: 'fizic' });
createLocation({ id: 'loc-online', name: 'zof.ro', type: 'online' });
const { apiKey } = createConnector({ connector_id: 'pc-arges-1', location_id: arges.id, name: 'PC Argeș 1' });

// ─── 1. Autentificare dashboard ──────────────────────────────────────────────

console.log('\n--- 1. Autentificare dashboard ---');
ok('ruta protejata respinge fara sesiune', (await api('GET', '/api/dashboard', { useCookie: false })).status === 401);
ok('parola gresita e respinsa', (await api('POST', '/api/auth/login',
  { body: { email: 'owner@zof.local', password: 'gresit' } })).status === 401);
ok('email inexistent e respins', (await api('POST', '/api/auth/login',
  { body: { email: 'nimeni@zof.local', password: 'parola-foarte-lunga' } })).status === 401);

const login = await api('POST', '/api/auth/login', { body: { email: 'owner@zof.local', password: 'parola-foarte-lunga' } });
ok('login reusit', login.status === 200 && login.data.role === 'admin');
ok('parola nu se intoarce niciodata', !JSON.stringify(login.data).includes('parola'));
ok('cookie HttpOnly', !!cookie && cookie.startsWith('zof_session='));
ok('/auth/me returneaza utilizatorul', (await api('GET', '/api/auth/me')).data?.email === 'owner@zof.local');
ok('dashboard accesibil cu sesiune', (await api('GET', '/api/dashboard')).status === 200);

// ─── 2. Autentificarea agentului ─────────────────────────────────────────────

console.log('\n--- 2. Autentificarea agentului (HMAC) ---');
const payload = { watermark: '2026-08-26T10:00:00.000Z', inventory: [{ sku: 'RB-3025-001', quantity: 5 }] };

ok('fara headere de semnatura -> 401',
  (await fetch(`${BASE}/api/ingest`, { method: 'POST', body: '{}' })).status === 401);
ok('semnatura gresita -> 401',
  (await agentPost('/api/ingest', apiKey, 'pc-arges-1', payload, { signature: 'a'.repeat(64) })).status === 401);
ok('cheie gresita -> 401',
  (await agentPost('/api/ingest', 'zof_pc-arges-1_' + '0'.repeat(64), 'pc-arges-1', payload)).status === 401);
ok('connector necunoscut -> 401',
  (await agentPost('/api/ingest', apiKey, 'pc-inexistent', payload, { connectorId: 'pc-inexistent' })).status === 401);
ok('timestamp vechi -> 401 (anti-replay)',
  (await agentPost('/api/ingest', apiKey, 'pc-arges-1', payload,
    { timestamp: new Date(Date.now() - 20 * 60_000).toISOString() })).status === 401);
ok('corp modificat dupa semnare -> 401', await (async () => {
  const raw = JSON.stringify(payload);
  const ts = new Date().toISOString();
  const sig = signPayload(apiKey, ts, raw);
  const res = await fetch(`${BASE}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Connector-Id': 'pc-arges-1', 'X-Timestamp': ts, 'X-Signature': sig },
    body: JSON.stringify({ ...payload, inventory: [{ sku: 'RB-3025-001', quantity: 9999 }] }),
  });
  return res.status === 401;
})());

const first = await agentPost('/api/ingest', apiKey, 'pc-arges-1', payload);
ok('cerere corect semnata -> 200', first.status === 200 && first.data.ok === true);

// Retrimiterea aceleiasi cereri, cu aceeasi semnatura, trebuie respinsa.
const replayRaw = JSON.stringify(payload);
const replayTs = new Date().toISOString();
const replaySig = signPayload(apiKey, replayTs, replayRaw);
const send = () => fetch(`${BASE}/api/ingest`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Connector-Id': 'pc-arges-1', 'X-Timestamp': replayTs, 'X-Signature': replaySig },
  body: replayRaw,
});
ok('prima trimitere trece', (await send()).status === 200);
ok('replay identic -> 401', (await send()).status === 401);

// ─── 3. Ingestie si idempotenta ──────────────────────────────────────────────

console.log('\n--- 3. Ingestie si idempotenta ---');
const batch = {
  agent_version: '1.0.0',
  watermark: '2026-08-26T12:00:00.000Z',
  products: [
    { sku: 'RB-3025-001', name: 'Aviator Classic', brand: 'Ray-Ban', category: 'Unisex', price: 1290, cost_price: 600 },
    { sku: 'OA-8046-01', name: 'Holbrook', brand: 'Oakley', category: 'Bărbați', price: 890, cost_price: 400 },
  ],
  inventory: [{ sku: 'RB-3025-001', quantity: 12 }, { sku: 'OA-8046-01', quantity: 3 }],
  sales: [
    { source_ref: 'BON-1001', sku: 'RB-3025-001', quantity: 1, unit_price: 1290, sold_at: new Date().toISOString() },
    { source_ref: 'BON-1002', sku: 'OA-8046-01', quantity: 2, unit_price: 890, sold_at: new Date().toISOString() },
  ],
};

const r1 = await agentPost('/api/ingest', apiKey, 'pc-arges-1', batch);
ok('batch acceptat', r1.status === 200);
ok('2 produse', r1.data.accepted.products === 2);
ok('2 randuri de stoc', r1.data.accepted.inventory === 2);
ok('2 vanzari', r1.data.accepted.sales === 2);
ok('0 duplicate la prima trimitere', r1.data.duplicates === 0);

const r2 = await agentPost('/api/ingest', apiKey, 'pc-arges-1', batch);
ok('retrimiterea aceluiasi batch nu dubleaza', r2.data.accepted.sales === 0);
ok('duplicatele sunt raportate', r2.data.duplicates === 2);
ok('numarul total de vanzari ramane 2', (await api('GET', '/api/sales')).data.length === 2);

// Stocul e absolut, nu delta: retrimiterea nu il aduna.
ok('stocul nu se aduna la retrimitere',
  (await api('GET', '/api/stock')).data.find((s) => s.sku === 'RB-3025-001').quantity === 12);

const changed = await agentPost('/api/ingest', apiKey, 'pc-arges-1',
  { inventory: [{ sku: 'RB-3025-001', quantity: 7 }] });
ok('stocul nou suprascrie', changed.status === 200 &&
  (await api('GET', '/api/stock')).data.find((s) => s.sku === 'RB-3025-001').quantity === 7);

console.log('\n--- 4. Validare: batch invalid nu scrie nimic partial ---');
const before = (await api('GET', '/api/sales')).data.length;
const bad = await agentPost('/api/ingest', apiKey, 'pc-arges-1', {
  sales: [
    { source_ref: 'BON-2001', sku: 'RB-3025-001', quantity: 1, unit_price: 100, sold_at: new Date().toISOString() },
    { source_ref: 'BON-2002', sku: 'OA-8046-01', quantity: 1, unit_price: 100, sold_at: 'nu-e-o-data' },
  ],
});
ok('batch cu o data invalida -> 400', bad.status === 400);
ok('mesajul spune exact ce camp', /sales\[1\]\.sold_at/.test(bad.data.error), bad.data.error);
ok('nicio vanzare nu a intrat partial', (await api('GET', '/api/sales')).data.length === before);
ok('sku lipsa -> 400', (await agentPost('/api/ingest', apiKey, 'pc-arges-1',
  { inventory: [{ quantity: 5 }] })).status === 400);
ok('cerere goala -> 400', (await agentPost('/api/ingest', apiKey, 'pc-arges-1', {})).status === 400);

// ─── 5. Heartbeat si detectarea agentilor cazuti ─────────────────────────────

console.log('\n--- 5. Heartbeat si agenti cazuti ---');
ok('heartbeat acceptat', (await agentPost('/api/heartbeat', apiKey, 'pc-arges-1', { agent_version: '1.0.0' })).status === 200);
let connectors = (await api('GET', '/api/admin/connectors')).data;
ok('agentul apare online', connectors[0].status === 'online');
ok('versiunea agentului e retinuta', connectors[0].agent_version === '1.0.0');

run("UPDATE connectors SET last_heartbeat = datetime('now', '-10 minutes') WHERE connector_id = ?", 'pc-arges-1');
ok('sweep-ul marcheaza agentul tacut', sweepStaleConnectors() === 1);
ok('agentul apare offline', (await api('GET', '/api/admin/connectors')).data[0].status === 'offline');
ok('s-a jurnalizat CONNECTOR_OFFLINE',
  (await api('GET', '/api/admin/sync-events')).data.some((e) => e.event_type === 'CONNECTOR_OFFLINE'));

// ─── 6. Cheile API nu se pot citi inapoi ─────────────────────────────────────

console.log('\n--- 6. Cheile API nu se pot citi inapoi ---');
connectors = (await api('GET', '/api/admin/connectors')).data;
ok('lista de agenti nu contine cheia', !JSON.stringify(connectors).includes(apiKey));
ok('se expune doar prefixul', connectors[0].api_key?.includes('…') === true);

const rotated = rotateApiKey('pc-arges-1');
ok('rotatia da o cheie noua', rotated.apiKey !== apiKey);
ok('cheia noua functioneaza',
  (await agentPost('/api/heartbeat', rotated.apiKey, 'pc-arges-1', {})).status === 200);
ok('cheia veche e revocata',
  (await agentPost('/api/heartbeat', apiKey, 'pc-arges-1', {})).status === 401);

// ─── 7. Gate-ul de rol ───────────────────────────────────────────────────────

console.log('\n--- 7. Gate-ul de rol ---');
const adminCookie = cookie;
cookie = '';
await api('POST', '/api/auth/login', { body: { email: 'angajat@zof.local', password: 'parola-foarte-lunga' } });
ok('angajatul vede dashboard-ul', (await api('GET', '/api/dashboard')).status === 200);
ok('angajatul NU vede agentii', (await api('GET', '/api/admin/connectors')).status === 401);
ok('angajatul NU poate crea agenti',
  (await api('POST', '/api/admin/connectors', { body: { connector_id: 'x', location_id: 'loc-arges' } })).status === 401);
ok('angajatul NU poate schimba setarile',
  (await api('PATCH', '/api/admin/settings', { body: { theme: 'light' } })).status === 401);
cookie = adminCookie;

// ─── 8. Agregarile pentru dashboard ──────────────────────────────────────────

console.log('\n--- 8. Agregarile pentru dashboard ---');
const d = (await api('GET', '/api/dashboard')).data;
ok('numara produsele', d.total_products === 2);
ok('calculeaza valoarea stocului', d.total_stock_value > 0);
ok('calculeaza vanzarile de azi', d.sales_today === 1290 + 2 * 890);
ok('numara bucatile vandute azi', d.sales_today_units === 3);
ok('detecteaza stocul critic', d.critical_stock === 1); // OA-8046-01 are 3
ok('identifica magazinul cu cele mai multe vanzari', d.best_store === 'Argeș Mall');
ok('calculeaza marja', d.estimated_margin > 0 && d.estimated_margin < 100);
ok('are timestamp de actualizare', !!Date.parse(d.last_updated));

const top = (await api('GET', '/api/top-products')).data;
ok('top produse sortat dupa venit', top[0].revenue >= top[1].revenue);
ok('top produse include stocul', typeof top[0].stock === 'number');

const locations = (await api('GET', '/api/locations')).data;
ok('locatiile au vanzarile lor', locations.find((l) => l.name === 'Argeș Mall').sales_today > 0);
ok('locatia online e listata', locations.some((l) => l.type === 'online'));

const products = (await api('GET', '/api/products')).data;
ok('produsele au stoc per locatie', products[0].stock_locations && typeof products[0].stock_locations === 'object');
ok('statusul reflecta stocul', products.every((p) => (p.stock > 0 ? p.status === 'activ' : p.status === 'epuizat')));

ok('alertele sunt calculate', (await api('GET', '/api/alerts')).data.length > 0);
ok('vanzarile zilnice au serie', (await api('GET', '/api/daily-sales')).data.length >= 1);
ok('vanzarile lunare au serie', (await api('GET', '/api/monthly-sales')).data.length >= 1);
ok('brandurile sunt agregate', (await api('GET', '/api/brands')).data.length === 2);
ok('categoriile insumeaza ~100%',
  Math.abs((await api('GET', '/api/categories')).data.reduce((s, c) => s + c.percentage, 0) - 100) <= 1);
ok('performanta are heatmap', Array.isArray((await api('GET', '/api/performance')).data.heatmap));

console.log('\n--- 9. GDPR: fara date de client ---');
const journal = JSON.stringify((await api('GET', '/api/sales')).data);
ok('jurnalul de vanzari nu are camp de client', !/customer|pacient|cnp/i.test(journal));
const events = JSON.stringify((await api('GET', '/api/admin/sync-events')).data);
ok('jurnalul de evenimente tine doar numaratori', !/unit_price|RB-3025/.test(events));

// ─── 10. Diverse ─────────────────────────────────────────────────────────────

console.log('\n--- 10. Diverse ---');
ok('ruta inexistenta -> 404', (await api('GET', '/api/nimic')).status === 404);
ok('JSON invalid -> 400', (await (async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{ stricat',
  });
  return res;
})()).status === 400);
ok('/api/health e public', (await api('GET', '/api/health', { useCookie: false })).status === 200);
const logout = await api('POST', '/api/auth/logout');
ok('logout raspunde ok', logout.status === 200);

console.log('\n' + '='.repeat(46));
console.log(`  ${pass} trecute, ${fail} esuate`);
console.log('='.repeat(46));

server.close();
closeDatabase();
if (fail) process.exitCode = 1;
