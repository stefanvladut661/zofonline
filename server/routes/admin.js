import { all, get, run, transaction } from '../db/index.js';
import { apiKeyPrefix, encryptSecret, generateApiKey, randomId, sha256 } from '../lib/crypto.js';
import { badRequest, notFound } from '../lib/http.js';

/**
 * Rutele de administrare folosite de dashboard: locatii, agenti, chei API,
 * jurnal de evenimente, setari.
 *
 * Toate cer sesiune de admin — vezi requireAdmin din server/lib/session.js.
 */

// ─── Locatii ─────────────────────────────────────────────────────────────────

export function listLocations() {
  return all('SELECT * FROM locations ORDER BY name').map((l) => ({ ...l, is_active: !!l.is_active }));
}

export function createLocation(body) {
  const name = String(body?.name ?? '').trim();
  if (!name) throw badRequest('Campul name e obligatoriu');
  const type = body?.type === 'online' ? 'online' : 'fizic';
  const id = String(body?.id ?? '').trim() || randomId();

  if (get('SELECT id FROM locations WHERE id = ?', id)) {
    throw badRequest(`Exista deja o locatie cu id "${id}"`);
  }
  run(
    'INSERT INTO locations (id, name, code, type, shopify_location_id, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    id, name, body?.code ?? null, type, body?.shopify_location_id ?? null,
    body?.is_active === false ? 0 : 1,
  );
  return get('SELECT * FROM locations WHERE id = ?', id);
}

export function updateLocation(id, body) {
  const existing = get('SELECT * FROM locations WHERE id = ?', id);
  if (!existing) throw notFound('Locatie inexistenta');
  run(`
    UPDATE locations SET name = ?, code = ?, type = ?, shopify_location_id = ?, is_active = ?
    WHERE id = ?
  `,
    body?.name ?? existing.name,
    body?.code ?? existing.code,
    body?.type ?? existing.type,
    body?.shopify_location_id ?? existing.shopify_location_id,
    body?.is_active === undefined ? existing.is_active : (body.is_active ? 1 : 0),
    id);
  return get('SELECT * FROM locations WHERE id = ?', id);
}

// ─── Agenti (connectori) ─────────────────────────────────────────────────────

const publicConnector = (c) => ({
  id: c.id,
  connector_id: c.connector_id,
  name: c.name,
  location_id: c.location_id,
  location_name: c.location_name ?? null,
  status: c.status,
  source_type: c.source_type,
  agent_version: c.agent_version,
  last_heartbeat: c.last_heartbeat,
  last_sync_time: c.last_sync_time,
  sync_count: c.sync_count,
  last_error_message: c.last_error_message,
  dorsoft_sync_enabled: !!c.dorsoft_sync_enabled,
  heartbeat_threshold_seconds: c.heartbeat_threshold_seconds,
  // Doar prefixul cheii active. Cheia intreaga se vede o singura data, la creare.
  api_key: c.key_prefix ?? null,
  created_date: c.created_at,
});

const CONNECTOR_SELECT = `
  SELECT c.*, l.name AS location_name,
         (SELECT key_prefix FROM api_keys
           WHERE connector_id = c.connector_id AND is_active = 1
           ORDER BY created_at DESC LIMIT 1) AS key_prefix
  FROM connectors c LEFT JOIN locations l ON l.id = c.location_id
`;

export function listConnectors() {
  return all(`${CONNECTOR_SELECT} ORDER BY c.created_at DESC`).map(publicConnector);
}

/**
 * Creeaza agentul + prima lui cheie API.
 * Cheia in clar se returneaza O SINGURA DATA, aici. Dupa asta nu mai exista
 * nicaieri intr-o forma pe care serverul sa o poata afisa.
 */
export function createConnector(body) {
  const connectorId = String(body?.connector_id ?? body?.connectorId ?? '').trim();
  const locationId = String(body?.location_id ?? body?.locationId ?? '').trim();
  const name = String(body?.name ?? '').trim() || connectorId;

  if (!connectorId) throw badRequest('Campul connector_id e obligatoriu');
  if (!/^[a-zA-Z0-9_-]+$/.test(connectorId)) {
    throw badRequest('connector_id poate contine doar litere, cifre, "-" si "_"');
  }
  if (!locationId) throw badRequest('Campul location_id e obligatoriu');
  if (!get('SELECT id FROM locations WHERE id = ?', locationId)) {
    throw badRequest(`Locatia "${locationId}" nu exista`);
  }
  if (get('SELECT id FROM connectors WHERE connector_id = ?', connectorId)) {
    throw badRequest(`Exista deja un connector cu id "${connectorId}"`);
  }

  const apiKey = generateApiKey(connectorId);
  const enc = encryptSecret(apiKey);
  const id = randomId();

  transaction((db) => {
    db.prepare(`
      INSERT INTO connectors (id, connector_id, name, location_id, source_type, heartbeat_threshold_seconds)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, connectorId, name, locationId, body?.source_type ?? 'dorsoft',
      Number(body?.heartbeat_threshold_seconds) || 90);

    db.prepare(`
      INSERT INTO api_keys (id, connector_id, name, key_prefix, key_hash, key_ct, key_iv, key_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomId(), connectorId, name, apiKeyPrefix(apiKey), sha256(apiKey), enc.ct, enc.iv, enc.tag);

    db.prepare(`
      INSERT INTO sync_state (connector_id, location_id, status) VALUES (?, ?, 'unknown')
      ON CONFLICT(connector_id) DO NOTHING
    `).run(connectorId, locationId);

    db.prepare(`
      INSERT INTO sync_events (id, event_type, connector_id, location_id, source_type, timestamp, payload)
      VALUES (?, 'CONNECTOR_ONLINE', ?, ?, ?, ?, ?)
    `).run(randomId(), connectorId, locationId, body?.source_type ?? 'dorsoft',
      new Date().toISOString(), JSON.stringify({ action: 'created' }));
  });

  return {
    connector: publicConnector(get(`${CONNECTOR_SELECT} WHERE c.connector_id = ?`, connectorId)),
    apiKey,
  };
}

export function updateConnector(id, body) {
  const existing = get('SELECT * FROM connectors WHERE id = ?', id);
  if (!existing) throw notFound('Connector inexistent');

  const fields = [];
  const values = [];
  const allowed = {
    name: (v) => String(v),
    status: (v) => (['online', 'offline', 'warning'].includes(v) ? v : existing.status),
    dorsoft_sync_enabled: (v) => (v ? 1 : 0),
    heartbeat_threshold_seconds: (v) => Number(v) || 90,
    last_error_message: (v) => (v == null ? null : String(v)),
  };
  for (const [key, coerce] of Object.entries(allowed)) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) {
      fields.push(`${key} = ?`);
      values.push(coerce(body[key]));
    }
  }
  if (!fields.length) return publicConnector(get(`${CONNECTOR_SELECT} WHERE c.id = ?`, id));

  fields.push('updated_at = ?');
  values.push(new Date().toISOString(), id);
  run(`UPDATE connectors SET ${fields.join(', ')} WHERE id = ?`, ...values);
  return publicConnector(get(`${CONNECTOR_SELECT} WHERE c.id = ?`, id));
}

export function deleteConnector(id) {
  const existing = get('SELECT * FROM connectors WHERE id = ?', id);
  if (!existing) throw notFound('Connector inexistent');

  transaction((db) => {
    db.prepare(`
      UPDATE api_keys SET is_active = 0, revoked_at = ? WHERE connector_id = ?
    `).run(new Date().toISOString(), existing.connector_id);
    db.prepare('DELETE FROM sync_state WHERE connector_id = ?').run(existing.connector_id);
    db.prepare('DELETE FROM connectors WHERE id = ?').run(id);
  });
  return { id };
}

/** Roteste cheia: emite una noua si o revoca pe cea veche. */
export function rotateApiKey(connectorId) {
  const connector = get('SELECT * FROM connectors WHERE connector_id = ?', connectorId);
  if (!connector) throw notFound('Connector inexistent');

  const apiKey = generateApiKey(connectorId);
  const enc = encryptSecret(apiKey);

  transaction((db) => {
    db.prepare('UPDATE api_keys SET is_active = 0, revoked_at = ? WHERE connector_id = ? AND is_active = 1')
      .run(new Date().toISOString(), connectorId);
    db.prepare(`
      INSERT INTO api_keys (id, connector_id, name, key_prefix, key_hash, key_ct, key_iv, key_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomId(), connectorId, connector.name ?? connectorId, apiKeyPrefix(apiKey),
      sha256(apiKey), enc.ct, enc.iv, enc.tag);
  });

  return { apiKey, connector_id: connectorId };
}

// ─── Jurnal ──────────────────────────────────────────────────────────────────

export function listSyncEvents({ limit = 100 } = {}) {
  return all(`
    SELECT e.*, l.name AS location_name FROM sync_events e
    LEFT JOIN locations l ON l.id = e.location_id
    ORDER BY e.timestamp DESC LIMIT ?
  `, Math.min(1000, Math.max(1, Number(limit) || 100)))
    .map((e) => ({ ...e, payload: e.payload ? JSON.parse(e.payload) : {} }));
}

// ─── Setari ──────────────────────────────────────────────────────────────────

export function getSettings() {
  let row = get('SELECT * FROM app_settings WHERE id = ?', 'default');
  if (!row) {
    run('INSERT INTO app_settings (id) VALUES (?)', 'default');
    row = get('SELECT * FROM app_settings WHERE id = ?', 'default');
  }
  return row;
}

export function updateSettings(body) {
  getSettings();
  const allowed = ['refresh_dashboard', 'refresh_charts', 'refresh_reports',
    'shopify_store_url', 'theme', 'critical_stock_threshold'];
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (fields.length) {
    fields.push('updated_at = ?');
    values.push(new Date().toISOString(), 'default');
    run(`UPDATE app_settings SET ${fields.join(', ')} WHERE id = ?`, ...values);
  }
  return getSettings();
}

// ─── Sanatatea sistemului ────────────────────────────────────────────────────

export function getHealth() {
  const connectors = all('SELECT status FROM connectors');
  const online = connectors.filter((c) => c.status === 'online').length;
  return {
    status: connectors.length === 0 ? 'no_connectors' : online > 0 ? 'ok' : 'degraded',
    version: '1.0.0',
    connectors_total: connectors.length,
    connectors_online: online,
    timestamp: new Date().toISOString(),
  };
}
