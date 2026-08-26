/**
 * Connector Service
 * Gestioneaza cheile API, heartbeat-ul, ingestia de evenimente si starea
 * connectorilor Dorsoft.
 *
 * Arhitectura: entitatile trec prin src/lib/data (schema + adaptor), nu prin
 * niciun SDK extern. Cat timp adaptorul e cel local, functiile astea opereaza
 * in browser; cand backend-ul central e gata (Faza 1) acelasi cod ajunge pe
 * server fara modificari — de aceea nu depinde de nimic din UI.
 */

import { db } from '@/lib/data';

// ─── API Key Management ──────────────────────────────────────────────────────

/**
 * Genereaza o cheie API cu 256 de biti de entropie criptografica.
 * Versiunea anterioara folosea Math.random() — predictibil, nepotrivit pentru
 * un secret care autentifica un connector (plan.md §9).
 */
export function generateApiKey(connectorId) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `zof_${connectorId}_${secret}`;
}

/** SHA-256 hex. Singura forma sub care o cheie ajunge sa fie stocata. */
export async function hashApiKey(keyValue) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyValue));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Prefix scurt, doar ca sa poti identifica o cheie in UI fara sa o expui. */
export function apiKeyPrefix(keyValue) {
  return `${keyValue.slice(0, 12)}…${keyValue.slice(-4)}`;
}

/**
 * Creeaza o cheie si o returneaza IN CLAR o singura data, apelantului.
 * Nu se mai poate recupera dupa — in baza raman doar hash-ul si prefixul.
 */
export async function createApiKey(connectorId, name) {
  const keyValue = generateApiKey(connectorId);
  await db.entities.ApiKey.create({
    key_hash: await hashApiKey(keyValue),
    key_prefix: apiKeyPrefix(keyValue),
    connector_id: connectorId,
    name,
    is_active: true,
  });
  return keyValue;
}

export async function revokeApiKey(keyId) {
  return db.entities.ApiKey.update(keyId, {
    is_active: false,
    revoked_at: new Date().toISOString(),
  });
}

export async function validateApiKey(keyValue) {
  const keys = await db.entities.ApiKey.filter({
    key_hash: await hashApiKey(keyValue),
    is_active: true,
  });
  if (!keys?.length) throw new Error('Invalid or revoked API key');
  await db.entities.ApiKey.update(keys[0].id, { last_used: new Date().toISOString() });
  return keys[0];
}

// ─── Connector CRUD ──────────────────────────────────────────────────────────

export async function createConnector({ connectorId, name, locationId, locationName, sourceType = 'dorsoft' }) {
  const apiKey = await createApiKey(connectorId, name);
  const connector = await db.entities.Connector.create({
    connector_id: connectorId,
    name,
    location_id: locationId,
    location_name: locationName,
    api_key: apiKeyPrefix(apiKey),
    api_key_hash: await hashApiKey(apiKey),
    status: 'offline',
    sync_count: 0,
    source_type: sourceType,
    dorsoft_sync_enabled: true,
    heartbeat_threshold_seconds: 90,
  });
  await logEvent('CONNECTOR_ONLINE', connectorId, locationId, locationName, sourceType, { action: 'created' });
  return { connector, apiKey };
}

export async function deleteConnector(connectorDbId, connectorId) {
  await db.entities.Connector.delete(connectorDbId);
  // Revoke all associated API keys
  const keys = await db.entities.ApiKey.filter({ connector_id: connectorId });
  for (const k of (keys || [])) {
    await db.entities.ApiKey.update(k.id, { is_active: false, revoked_at: new Date().toISOString() });
  }
}

// ─── Heartbeat Processing ────────────────────────────────────────────────────

const HEARTBEAT_TIMEOUT_MS = 90_000; // 90s

export async function processHeartbeat(connectorId, locationId, locationName, sourceType = 'dorsoft') {
  const now = new Date().toISOString();
  const connectors = await db.entities.Connector.filter({ connector_id: connectorId });
  if (connectors?.length) {
    await db.entities.Connector.update(connectors[0].id, {
      last_heartbeat: now,
      status: 'online',
      last_error_message: null,
    });
  }
  await logEvent('HEARTBEAT', connectorId, locationId, locationName, sourceType, { timestamp: now });
}

export async function checkConnectorStatuses() {
  const connectors = await db.entities.Connector.list();
  const now = Date.now();
  for (const c of (connectors || [])) {
    if (!c.last_heartbeat) continue;
    const threshold = (c.heartbeat_threshold_seconds || 90) * 1000;
    const elapsed = now - new Date(c.last_heartbeat).getTime();
    if (elapsed > threshold && c.status !== 'offline') {
      await db.entities.Connector.update(c.id, { status: 'offline' });
      await logEvent('CONNECTOR_OFFLINE', c.connector_id, c.location_id, c.location_name, c.source_type, {
        reason: 'heartbeat_timeout',
        elapsed_ms: elapsed,
      });
    }
  }
}

// ─── Event Logging ───────────────────────────────────────────────────────────

export async function logEvent(eventType, connectorId, locationId, locationName, sourceType, payload, status = 'ok', errorMessage = null) {
  return db.entities.SyncEvent.create({
    event_type: eventType,
    connector_id: connectorId,
    location_id: locationId,
    location_name: locationName || '',
    source_type: sourceType || 'system',
    timestamp: new Date().toISOString(),
    payload: payload || {},
    status,
    error_message: errorMessage,
  });
}

// ─── Data Ingestion ──────────────────────────────────────────────────────────

export async function ingestSale(connectorId, locationId, locationName, sourceType, saleData) {
  const connectors = await db.entities.Connector.filter({ connector_id: connectorId });
  if (connectors?.length) {
    const c = connectors[0];
    await db.entities.Connector.update(c.id, {
      last_sync_time: new Date().toISOString(),
      sync_count: (c.sync_count || 0) + 1,
    });
  }
  return logEvent('SALE_CREATED', connectorId, locationId, locationName, sourceType, saleData);
}

export async function ingestStockUpdate(connectorId, locationId, locationName, sourceType, stockData) {
  return logEvent('STOCK_UPDATED', connectorId, locationId, locationName, sourceType, stockData);
}

export async function ingestFullSync(connectorId, locationId, locationName, sourceType, data) {
  const connectors = await db.entities.Connector.filter({ connector_id: connectorId });
  if (connectors?.length) {
    const c = connectors[0];
    await db.entities.Connector.update(c.id, {
      last_sync_time: new Date().toISOString(),
      sync_count: (c.sync_count || 0) + 1,
      status: 'online',
    });
  }
  return logEvent('SYNC_FULL', connectorId, locationId, locationName, sourceType, data);
}

// ─── REST API Response Builders (for /api/... endpoint simulation) ───────────

export function buildHealthResponse(connectors) {
  const online = (connectors || []).filter(c => c.status === 'online').length;
  return {
    status: online > 0 ? 'ok' : 'degraded',
    version: '1.0.0',
    uptime_since: new Date(Date.now() - 86400000 * 3).toISOString(),
    connectors_total: (connectors || []).length,
    connectors_online: online,
    timestamp: new Date().toISOString(),
  };
}

export function buildConnectorsResponse(connectors) {
  return (connectors || []).map(c => ({
    connector_id: c.connector_id,
    name: c.name,
    location_id: c.location_id,
    location_name: c.location_name,
    status: c.status,
    source_type: c.source_type,
    last_heartbeat: c.last_heartbeat,
    last_sync_time: c.last_sync_time,
    sync_count: c.sync_count,
    dorsoft_sync_enabled: c.dorsoft_sync_enabled,
  }));
}