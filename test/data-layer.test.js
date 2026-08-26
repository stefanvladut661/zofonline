import { db } from '@/lib/data';
import { applySchema, SyncEvent } from '@/lib/data/schema';
import {
  createConnector,
  validateApiKey,
  processHeartbeat,
  checkConnectorStatuses,
  hashApiKey,
  apiKeyPrefix,
} from '@/lib/connector-service';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

console.log('\n--- 1. Schema: defaults + fail-loud ---');
const c = applySchema(db.entities.Connector ? (await import('@/lib/data/schema')).Connector : null,
  { connector_id: 'X', location_id: 'L', api_key: 'k' });
ok('defaults aplicate (status=offline)', c.status === 'offline', JSON.stringify(c.status));
ok('defaults aplicate (heartbeat=90)', c.heartbeat_threshold_seconds === 90);
try {
  applySchema((await import('@/lib/data/schema')).Connector, { connector_id: 'X' });
  ok('arunca pe campuri obligatorii lipsa', false, 'nu a aruncat');
} catch (e) {
  ok('arunca pe campuri obligatorii lipsa', /obligatorii lipsa/.test(e.message));
}
try {
  applySchema((await import('@/lib/data/schema')).Connector,
    { connector_id: 'X', location_id: 'L', api_key: 'k', status: 'inventat' });
  ok('arunca pe enum invalid', false, 'nu a aruncat');
} catch (e) {
  ok('arunca pe enum invalid', /nu e in enum/.test(e.message));
}

console.log('\n--- 2. GDPR: minimizarea payload-ului ---');
const ev = applySchema(SyncEvent, {
  event_type: 'SALE_CREATED', connector_id: 'c1', location_id: 'l1',
  source_type: 'dorsoft', timestamp: new Date().toISOString(),
  payload: {
    sku: 'RB-3025', quantity: 1, unit_price: 1290,
    nume_pacient: 'Ion Popescu', cnp: '1900101123456', diagnostic: 'miopie',
  },
});
ok('pastreaza campurile permise', ev.payload.sku === 'RB-3025' && ev.payload.quantity === 1);
ok('taie nume_pacient', ev.payload.nume_pacient === undefined);
ok('taie cnp', ev.payload.cnp === undefined);
ok('taie diagnostic', ev.payload.diagnostic === undefined);

console.log('\n--- 3. Store + adaptor local (CRUD) ---');
const created = await db.entities.Connector.create({
  connector_id: 'pc-arges-1', name: 'PC Arges Mall 1',
  location_id: 'loc-1', location_name: 'Arges Mall', api_key: 'zof_x…abcd',
});
ok('create returneaza id', typeof created.id === 'string' && created.id.length > 0);
ok('create pune created_date', !!created.created_date);
const listed = await db.entities.Connector.list();
ok('list gaseste inregistrarea', listed.length === 1);
const filtered = await db.entities.Connector.filter({ connector_id: 'pc-arges-1' });
ok('filter pe egalitate', filtered.length === 1);
ok('filter nepotrivit -> gol', (await db.entities.Connector.filter({ connector_id: 'nope' })).length === 0);
const updated = await db.entities.Connector.update(created.id, { sync_count: 7 });
ok('update aplica patch', updated.sync_count === 7);
ok('update misca updated_date', updated.updated_date >= created.updated_date);
await db.entities.Connector.delete(created.id);
ok('delete sterge', (await db.entities.Connector.list()).length === 0);

console.log('\n--- 4. Sortare (-camp / camp) + limit ---');
for (const t of ['2024-01-03', '2024-01-01', '2024-01-02']) {
  await db.entities.SyncEvent.create({
    event_type: 'HEARTBEAT', connector_id: 'c', location_id: 'l',
    source_type: 'system', timestamp: t + 'T00:00:00.000Z',
  });
}
const desc = await db.entities.SyncEvent.list('-timestamp');
ok('sortare descrescatoare', desc[0].timestamp.startsWith('2024-01-03'));
const asc = await db.entities.SyncEvent.list('timestamp');
ok('sortare crescatoare', asc[0].timestamp.startsWith('2024-01-01'));
ok('limit taie rezultatele', (await db.entities.SyncEvent.list('-timestamp', 2)).length === 2);

console.log('\n--- 5. Chei API: hash, nu text in clar ---');
const { apiKey } = await createConnector({
  connectorId: 'pc-exercitiu-1', name: 'PC Exercitiu',
  locationId: 'loc-2', locationName: 'Exercitiu',
});
ok('cheia returnata are prefixul zof_', apiKey.startsWith('zof_pc-exercitiu-1_'));
ok('cheia are 64 hex de entropie', /_[0-9a-f]{64}$/.test(apiKey));
const storedKeys = await db.entities.ApiKey.list();
ok('ApiKey NU stocheaza cheia in clar',
  !JSON.stringify(storedKeys).includes(apiKey.split('_').pop()));
ok('ApiKey stocheaza SHA-256', storedKeys[0].key_hash === await hashApiKey(apiKey));
const conn = (await db.entities.Connector.filter({ connector_id: 'pc-exercitiu-1' }))[0];
ok('Connector.api_key e doar prefix', conn.api_key === apiKeyPrefix(apiKey));
ok('Connector NU contine cheia in clar', !JSON.stringify(conn).includes(apiKey));
ok('validateApiKey accepta cheia corecta', !!(await validateApiKey(apiKey)));
try {
  await validateApiKey('zof_pc-exercitiu-1_' + '0'.repeat(64));
  ok('validateApiKey respinge cheia gresita', false, 'a acceptat-o');
} catch { ok('validateApiKey respinge cheia gresita', true); }
const two = await Promise.all([1, 2].map(() => import('@/lib/connector-service').then(m => m.generateApiKey('z'))));
ok('cheile generate sunt unice', two[0] !== two[1]);

console.log('\n--- 6. Heartbeat + trecerea in offline ---');
await processHeartbeat('pc-exercitiu-1', 'loc-2', 'Exercitiu');
let c2 = (await db.entities.Connector.filter({ connector_id: 'pc-exercitiu-1' }))[0];
ok('heartbeat marcheaza online', c2.status === 'online');
ok('heartbeat scrie SyncEvent',
  (await db.entities.SyncEvent.filter({ event_type: 'HEARTBEAT', connector_id: 'pc-exercitiu-1' })).length === 1);
// simuleaza tacere de 5 minute (prag implicit 90s)
await db.entities.Connector.update(c2.id, {
  last_heartbeat: new Date(Date.now() - 5 * 60_000).toISOString(),
});
await checkConnectorStatuses();
c2 = (await db.entities.Connector.filter({ connector_id: 'pc-exercitiu-1' }))[0];
ok('agent tacut -> offline', c2.status === 'offline');
ok('a logat CONNECTOR_OFFLINE',
  (await db.entities.SyncEvent.filter({ event_type: 'CONNECTOR_OFFLINE' })).length === 1);

console.log('\n--- 7. Secretele Shopify nu mai pot fi salvate ---');
const s = await db.entities.AppSettings.create({
  api_base_url: 'http://localhost:3001/api',
  shopify_store_url: 'https://zof.myshopify.com',
  shopify_api_key: 'SECRET_KEY',
  shopify_access_token: 'shpat_SECRET',
});
ok('pastreaza url-ul magazinului', s.shopify_store_url === 'https://zof.myshopify.com');
ok('arunca api_key la gunoi', s.shopify_api_key === undefined);
ok('arunca access_token la gunoi', s.shopify_access_token === undefined);
ok('nu ajunge in storage', !JSON.stringify(await db.entities.AppSettings.list()).includes('shpat_SECRET'));

console.log('\n' + '='.repeat(46));
console.log(`  ${pass} trecute, ${fail} esuate`);
console.log('='.repeat(46));
if (fail) process.exitCode = 1;
