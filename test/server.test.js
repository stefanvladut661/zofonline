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

// Perioadele sunt ancorate pe ultima zi cu vanzari (azi, in test) si vin explicit.
const todayLocal = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();
ok('ultima zi raportata = ziua ultimei vanzari', d.period?.last_day?.to === todayLocal, JSON.stringify(d.period?.last_day));
ok('vanzarile ultimei zile = vanzarile de azi', d.sales_last_day === d.sales_today && d.sales_last_day_units === 3);
ok('saptamana = 7 zile pana la ultima zi', d.period.week.to === todayLocal
  && (Date.parse(d.period.week.to) - Date.parse(d.period.week.from)) / 86400_000 === 6, JSON.stringify(d.period.week));
ok('luna = de la 1 pana la ultima zi', d.period.month.from === `${todayLocal.slice(0, 7)}-01` && d.period.month.to === todayLocal);
// „vs luna trecuta" = aceeasi perioada din luna precedenta (1 .. aceeasi zi), nu luna intreaga.
const expectedPrev = (() => {
  const n = new Date();
  const first = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const lastDayPrev = new Date(n.getFullYear(), n.getMonth(), 0).getDate();
  const to = new Date(n.getFullYear(), n.getMonth() - 1, Math.min(n.getDate(), lastDayPrev));
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: iso(first), to: iso(to) };
})();
ok('luna trecuta = aceeasi perioada din luna precedenta', JSON.stringify(d.period.prev_month) === JSON.stringify(expectedPrev),
  `${JSON.stringify(d.period.prev_month)} vs ${JSON.stringify(expectedPrev)}`);
const { reportingPeriods } = await import('../server/routes/dashboard.js');
ok('31 martie -> 1–28 februarie (luna mai scurta se opreste la ultima ei zi)',
  JSON.stringify(reportingPeriods('2026-03-31').prev_month) === '{"from":"2026-02-01","to":"2026-02-28"}',
  JSON.stringify(reportingPeriods('2026-03-31').prev_month));
ok('17 septembrie -> 1–17 august', JSON.stringify(reportingPeriods('2026-09-17').prev_month) === '{"from":"2026-08-01","to":"2026-08-17"}');
ok('1 ianuarie -> 1–1 decembrie, anul trecut', JSON.stringify(reportingPeriods('2026-01-01').prev_month) === '{"from":"2025-12-01","to":"2025-12-01"}');
ok('fara luna trecuta, evolutia e null (nu 0%)', d.evolution_vs_last_month === null);
ok('fara comenzi online, evolutia online e null', d.shopify_evolution_vs_last_month === null && d.shopify_orders === 0);
ok('marja se bazeaza pe tot venitul cand toate produsele au pret de achizitie', d.margin_coverage === 100);
ok('profitul estimat = Σ cantitate × (pret − cost)', d.estimated_profit === (1290 - 600) + 2 * (890 - 400));
ok('fara fisier de export cunoscut, data_as_of e null dar sync-ul e stiut', d.data_as_of === null && !!Date.parse(d.last_sync_at));

// Un produs FARA pret de achizitie nu devine „profit 100%": iese din calcul si scade acoperirea.
await agentPost('/api/ingest', rotated.apiKey, 'pc-arges-1', {
  products: [{ sku: 'SRV-MANOPERA', name: 'Manoperă', category: 'servicii', price: 30 }],
  sales: [{ source_ref: 'BON-3001', sku: 'SRV-MANOPERA', quantity: 1, unit_price: 30, sold_at: new Date().toISOString() }],
});
const d2 = (await api('GET', '/api/dashboard')).data;
ok('produsul fara cost nu intra in profit', d2.estimated_profit === d.estimated_profit);
ok('acoperirea marjei scade sub 100%', d2.margin_coverage < 100 && d2.margin_coverage > 90, String(d2.margin_coverage));

console.log('\n--- 8b. Data fisierului de export (in loc de „Live") ---');
const fileTime = '2026-09-17T06:12:33.000Z';
const withFile = await agentPost('/api/ingest', rotated.apiKey, 'pc-arges-1', {
  source_file_name: 'ZOF-Arges-001.json', source_file_mtime: fileTime,
  sales: [{ source_ref: 'BON-4001', sku: 'RB-3025-001', quantity: 1, unit_price: 1290, sold_at: new Date().toISOString() }],
});
ok('ingest-ul confirma data fisierului', withFile.status === 200 && withFile.data.data_as_of === fileTime);
let fresh = (await api('GET', '/api/dashboard')).data;
ok('dashboard-ul expune data fisierului', fresh.data_as_of === fileTime);
ok('… si fisierul, per locatie', fresh.data_sources.some((s) => s.file === 'ZOF-Arges-001.json' && s.location === 'Argeș Mall' && s.as_of === fileTime));

await agentPost('/api/ingest', rotated.apiKey, 'pc-arges-1', {
  source_file_name: 'ZOF-Arges-000.json', source_file_mtime: '2026-09-10T06:00:00.000Z',
  sales: [{ source_ref: 'BON-4001', sku: 'RB-3025-001', quantity: 1, unit_price: 1290, sold_at: new Date().toISOString() }],
});
fresh = (await api('GET', '/api/dashboard')).data;
ok('retrimiterea unui fisier mai vechi nu da data inapoi', fresh.data_as_of === fileTime
  && fresh.data_sources[0].file === 'ZOF-Arges-001.json');
ok('data de fisier invalida -> 400', (await agentPost('/api/ingest', rotated.apiKey, 'pc-arges-1',
  { source_file_mtime: 'ieri', inventory: [{ sku: 'RB-3025-001', quantity: 7 }] })).status === 400);
ok('jurnalul retine fisierul, nu continutul',
  (await api('GET', '/api/admin/sync-events')).data.some((e) => e.payload?.source_file === 'ZOF-Arges-001.json'));

const top = (await api('GET', '/api/top-products')).data;
ok('top produse sortat dupa venit', top[0].revenue >= top[1].revenue);
ok('top produse include stocul', typeof top[0].stock === 'number');

const locations = (await api('GET', '/api/locations')).data;
ok('locatiile au vanzarile lor', locations.find((l) => l.name === 'Argeș Mall').sales_today > 0);
ok('locatia online e listata', locations.some((l) => l.type === 'online'));
ok('locatiile au vanzarile ultimei zile si perioada', locations.every((l) => typeof l.sales_last_day === 'number' && l.period?.last_day?.to === todayLocal));

const perf = (await api('GET', '/api/performance')).data;
ok('performanta e impartita per magazin', Array.isArray(perf.by_location) && perf.by_location.length === 2);
ok('magazinul cu vanzari e primul, cu 100% pondere', perf.by_location[0].name === 'Argeș Mall' && perf.by_location[0].share === 100);
ok('locatia fara vanzari apare cu 0', perf.by_location[1].revenue === 0 && perf.by_location[1].share === 0);
ok('performanta spune si perioada', perf.period?.month?.to === todayLocal);

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
