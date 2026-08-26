import { getDatabase, get, run, transaction } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest } from '../lib/http.js';

/**
 * Endpoint-ul de receptie a datelor de la agentii din locatii.
 *
 * Tot ce intra aici e UPSERT, niciodata INSERT simplu: agentul are voie sa
 * retrimita orice, oricand, fara sa dubleze nimic (plan.md §6). Cheia de
 * idempotenta pentru vanzari e (location_id, source_ref) — source_ref fiind
 * numarul de bon / id-ul tranzactiei din sistemul sursa.
 *
 * Batch-ul intreg e o singura tranzactie: ori intra tot, ori nimic. Un agent
 * caruia i se taie curentul la jumatatea trimiterii nu lasa date pe jumatate.
 */

const EVENT_LIMIT = 5000;

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`Camp obligatoriu lipsa sau gol: ${field}`);
  }
  return value.trim();
}

function requireNumber(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`Campul ${field} trebuie sa fie numeric`);
  return n;
}

function requireIsoDate(value, field) {
  const s = requireString(value, field);
  if (Number.isNaN(Date.parse(s))) throw badRequest(`Campul ${field} nu e o data ISO 8601 valida`);
  return s;
}

function assertArray(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`Campul ${field} trebuie sa fie un array`);
  if (value.length > EVENT_LIMIT) {
    throw badRequest(`${field}: maximum ${EVENT_LIMIT} inregistrari per cerere`);
  }
  return value;
}

/**
 * POST /api/ingest
 * Autentificat prin HMAC — vezi server/lib/agent-auth.js.
 */
export function handleIngest({ connector, body }) {
  const locationId = connector.location_id;

  const products = assertArray(body.products, 'products');
  const inventory = assertArray(body.inventory, 'inventory');
  const sales = assertArray(body.sales, 'sales');

  if (!products.length && !inventory.length && !sales.length && !body.watermark) {
    throw badRequest('Cerere goala: trimite products, inventory, sales sau watermark');
  }

  // Validam TOT inainte sa scriem ceva. Mai bine respingem batch-ul intreg cu un
  // mesaj clar decat sa scriem jumatate si sa lasam datele inconsistente.
  const cleanProducts = products.map((p, i) => ({
    sku: requireString(p.sku, `products[${i}].sku`),
    name: p.name ?? null,
    brand: p.brand ?? null,
    category: p.category ?? null,
    size: p.size ?? null,
    price: p.price == null ? null : requireNumber(p.price, `products[${i}].price`),
    cost_price: p.cost_price == null ? null : requireNumber(p.cost_price, `products[${i}].cost_price`),
    image_url: p.image_url ?? null,
    attributes: p.attributes ? JSON.stringify(p.attributes) : null,
    status: p.status ?? 'activ',
  }));

  const cleanInventory = inventory.map((it, i) => ({
    sku: requireString(it.sku, `inventory[${i}].sku`),
    quantity: Math.trunc(requireNumber(it.quantity, `inventory[${i}].quantity`)),
  }));

  const cleanSales = sales.map((s, i) => ({
    source_ref: requireString(s.source_ref, `sales[${i}].source_ref`),
    sku: requireString(s.sku, `sales[${i}].sku`),
    quantity: Math.trunc(requireNumber(s.quantity, `sales[${i}].quantity`)),
    unit_price: requireNumber(s.unit_price, `sales[${i}].unit_price`),
    sold_at: requireIsoDate(s.sold_at, `sales[${i}].sold_at`),
    channel: s.channel === 'online' ? 'online' : 'fizic',
  }));

  const now = new Date().toISOString();

  return transaction((db) => {
    const upsertProduct = db.prepare(`
      INSERT INTO products (sku, name, brand, category, size, price, cost_price, image_url, attributes, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sku) DO UPDATE SET
        name       = COALESCE(excluded.name, products.name),
        brand      = COALESCE(excluded.brand, products.brand),
        category   = COALESCE(excluded.category, products.category),
        size       = COALESCE(excluded.size, products.size),
        price      = COALESCE(excluded.price, products.price),
        cost_price = COALESCE(excluded.cost_price, products.cost_price),
        image_url  = COALESCE(excluded.image_url, products.image_url),
        attributes = COALESCE(excluded.attributes, products.attributes),
        status     = excluded.status,
        updated_at = excluded.updated_at
    `);
    for (const p of cleanProducts) {
      upsertProduct.run(p.sku, p.name, p.brand, p.category, p.size, p.price,
        p.cost_price, p.image_url, p.attributes, p.status, now);
    }

    // Stocul trimis de agent e absolut (cantitatea reala din locatie), nu un
    // delta. Un delta pierdut ar desincroniza permanent; o cantitate absoluta
    // se autocorecteaza la urmatorul sync.
    const upsertInventory = db.prepare(`
      INSERT INTO inventory (sku, location_id, quantity, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(sku, location_id) DO UPDATE SET
        quantity   = excluded.quantity,
        updated_at = excluded.updated_at
    `);
    for (const it of cleanInventory) {
      upsertInventory.run(it.sku, locationId, it.quantity, now);
    }

    // INSERT OR IGNORE + UNIQUE(location_id, source_ref) = idempotenta.
    const insertSale = db.prepare(`
      INSERT OR IGNORE INTO sales
        (id, location_id, sku, quantity, unit_price, sold_at, source_ref, channel, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let salesInserted = 0;
    for (const s of cleanSales) {
      const r = insertSale.run(randomId(), locationId, s.sku, s.quantity,
        s.unit_price, s.sold_at, s.source_ref, s.channel, now);
      salesInserted += Number(r.changes) > 0 ? 1 : 0;
    }
    const duplicates = cleanSales.length - salesInserted;

    // Watermark-ul avanseaza doar dupa ce datele au intrat. Daca tranzactia
    // cade, agentul retrimite de la acelasi punct.
    const watermark = body.watermark ?? null;
    db.prepare(`
      INSERT INTO sync_state (connector_id, location_id, last_watermark, last_heartbeat_at, status, agent_version, updated_at)
      VALUES (?, ?, ?, ?, 'online', ?, ?)
      ON CONFLICT(connector_id) DO UPDATE SET
        last_watermark    = COALESCE(excluded.last_watermark, sync_state.last_watermark),
        last_heartbeat_at = excluded.last_heartbeat_at,
        status            = 'online',
        agent_version     = COALESCE(excluded.agent_version, sync_state.agent_version),
        updated_at        = excluded.updated_at
    `).run(connector.connector_id, locationId, watermark, now, body.agent_version ?? null, now);

    db.prepare(`
      UPDATE connectors SET
        status = 'online', last_sync_time = ?, last_heartbeat = ?,
        sync_count = sync_count + 1, last_error_message = NULL,
        agent_version = COALESCE(?, agent_version), updated_at = ?
      WHERE connector_id = ?
    `).run(now, now, body.agent_version ?? null, now, connector.connector_id);

    // Jurnal: doar numaratori, niciodata continutul vanzarilor (plan.md §9).
    db.prepare(`
      INSERT INTO sync_events (id, event_type, connector_id, location_id, source_type, timestamp, payload, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ok')
    `).run(randomId(), 'SYNC_INCREMENTAL', connector.connector_id, locationId,
      connector.source_type, now,
      JSON.stringify({
        record_count: cleanProducts.length + cleanInventory.length + salesInserted,
        watermark,
      }));

    return {
      ok: true,
      accepted: {
        products: cleanProducts.length,
        inventory: cleanInventory.length,
        sales: salesInserted,
      },
      duplicates,
      watermark,
      server_time: now,
    };
  });
}

/**
 * POST /api/heartbeat
 * Semnal periodic „sunt viu". Fara el, dashboard-ul nu poate distinge un agent
 * cazut de unul care doar n-a avut vanzari (plan.md §7.8).
 */
export function handleHeartbeat({ connector, body }) {
  const now = new Date().toISOString();

  run(`
    UPDATE connectors SET status = 'online', last_heartbeat = ?,
      agent_version = COALESCE(?, agent_version), updated_at = ?
    WHERE connector_id = ?
  `, now, body?.agent_version ?? null, now, connector.connector_id);

  run(`
    INSERT INTO sync_state (connector_id, location_id, last_heartbeat_at, status, agent_version, updated_at)
    VALUES (?, ?, ?, 'online', ?, ?)
    ON CONFLICT(connector_id) DO UPDATE SET
      last_heartbeat_at = excluded.last_heartbeat_at,
      status            = 'online',
      agent_version     = COALESCE(excluded.agent_version, sync_state.agent_version),
      updated_at        = excluded.updated_at
  `, connector.connector_id, connector.location_id, now, body?.agent_version ?? null, now);

  run(`
    INSERT INTO sync_events (id, event_type, connector_id, location_id, source_type, timestamp, payload, status)
    VALUES (?, 'HEARTBEAT', ?, ?, ?, ?, ?, 'ok')
  `, randomId(), connector.connector_id, connector.location_id, connector.source_type, now,
    JSON.stringify({ timestamp: now }));

  return { ok: true, server_time: now };
}

/**
 * GET /api/sync-state — de unde reia agentul dupa o repornire.
 */
export function handleSyncState({ connector }) {
  const state = get('SELECT * FROM sync_state WHERE connector_id = ?', connector.connector_id);
  return {
    connector_id: connector.connector_id,
    location_id: connector.location_id,
    last_watermark: state?.last_watermark ?? null,
    last_heartbeat_at: state?.last_heartbeat_at ?? null,
    server_time: new Date().toISOString(),
  };
}

/** Marcheaza offline agentii care au tacut peste pragul lor. */
export function sweepStaleConnectors() {
  const db = getDatabase();
  const stale = db.prepare(`
    SELECT connector_id, location_id, source_type FROM connectors
    WHERE status != 'offline' AND last_heartbeat IS NOT NULL
      AND (julianday('now') - julianday(last_heartbeat)) * 86400 > heartbeat_threshold_seconds
  `).all();

  for (const c of stale) {
    db.prepare("UPDATE connectors SET status = 'offline' WHERE connector_id = ?").run(c.connector_id);
    db.prepare("UPDATE sync_state SET status = 'offline' WHERE connector_id = ?").run(c.connector_id);
    db.prepare(`
      INSERT INTO sync_events (id, event_type, connector_id, location_id, source_type, timestamp, payload, status)
      VALUES (?, 'CONNECTOR_OFFLINE', ?, ?, ?, ?, ?, 'warning')
    `).run(randomId(), c.connector_id, c.location_id, c.source_type, new Date().toISOString(),
      JSON.stringify({ reason: 'heartbeat_timeout' }));
  }
  return stale.length;
}
