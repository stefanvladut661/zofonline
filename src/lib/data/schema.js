/**
 * Definitiile de entitati — sursa unica de adevar pentru modelul de date.
 *
 * Inlocuiesc fisierele src/lib/schemas/*.jsonc care erau descriptori proprietari
 * Base44. Aici sunt cod obisnuit: le foloseste adaptorul local pentru defaults +
 * validare, si vor genera contractul endpoint-ului /ingest la Faza 1.
 *
 * Conventie campuri auto (adaugate de store, nu se declara aici):
 *   id, created_date, updated_date
 */

/** @typedef {'string'|'number'|'boolean'|'datetime'|'object'|'array'} FieldType */

const SOURCE_TYPES = ['dorsoft', 'shopify', 'manual', 'system'];

export const EVENT_TYPES = [
  'SALE_CREATED',
  'STOCK_UPDATED',
  'TRANSFER_CREATED',
  'PRODUCT_UPDATED',
  'HEARTBEAT',
  'CONNECTOR_ONLINE',
  'CONNECTOR_OFFLINE',
  'SYNC_FULL',
  'SYNC_INCREMENTAL',
];

export const Connector = {
  name: 'Connector',
  required: ['connector_id', 'location_id', 'api_key'],
  fields: {
    connector_id: { type: 'string', doc: 'ID unic per instalare / PC' },
    name: { type: 'string', doc: 'Denumire connector (ex: PC Arges Mall 1)' },
    location_id: { type: 'string', doc: 'ID locatie asignat' },
    location_name: { type: 'string', doc: 'Numele locatiei' },
    api_key: { type: 'string', doc: 'Prefixul vizibil al cheii (NU cheia in clar)' },
    api_key_hash: { type: 'string', doc: 'SHA-256 al cheii API — singura forma stocata' },
    status: { type: 'string', enum: ['online', 'offline', 'warning'], default: 'offline' },
    last_heartbeat: { type: 'datetime', doc: 'Ultimul heartbeat primit' },
    last_sync_time: { type: 'datetime', doc: 'Ultima sincronizare reusita' },
    sync_count: { type: 'number', default: 0, doc: 'Numarul total de sincronizari' },
    last_error_message: { type: 'string', doc: 'Ultimul mesaj de eroare' },
    dorsoft_sync_enabled: { type: 'boolean', default: true, doc: 'Sincronizare Dorsoft activa' },
    source_type: { type: 'string', enum: SOURCE_TYPES, default: 'dorsoft' },
    heartbeat_threshold_seconds: {
      type: 'number',
      default: 90,
      doc: 'Secundele dupa care un connector e marcat offline',
    },
  },
};

export const SyncEvent = {
  name: 'SyncEvent',
  required: ['event_type', 'connector_id', 'location_id', 'source_type', 'timestamp'],
  fields: {
    event_type: { type: 'string', enum: EVENT_TYPES, doc: 'Tipul evenimentului' },
    connector_id: { type: 'string', doc: 'ID-ul connectorului sursa' },
    location_id: { type: 'string', doc: 'ID-ul locatiei' },
    location_name: { type: 'string' },
    source_type: { type: 'string', enum: SOURCE_TYPES, default: 'dorsoft' },
    timestamp: { type: 'datetime' },
    // GDPR (plan.md §9): payload-ul NU mai e un obiect liber. Doar campurile
    // strict necesare dashboard-ului; orice altceva e taiat la scriere.
    payload: {
      type: 'object',
      allowedKeys: [
        'sku',
        'quantity',
        'unit_price',
        'location_id',
        'sold_at',
        'source_ref',
        'action',
        'reason',
        'elapsed_ms',
        'timestamp',
        'record_count',
        'watermark',
      ],
      doc: 'Date minimizate GDPR — fara identificatori de pacient',
    },
    status: { type: 'string', enum: ['ok', 'error', 'warning'], default: 'ok' },
    error_message: { type: 'string' },
  },
};

export const ApiKey = {
  name: 'ApiKey',
  required: ['key_hash', 'connector_id', 'name'],
  fields: {
    key_hash: { type: 'string', doc: 'SHA-256 al cheii API. Cheia in clar nu se stocheaza niciodata.' },
    key_prefix: { type: 'string', doc: 'Primele caractere, doar pentru identificare in UI' },
    connector_id: { type: 'string', doc: 'ID-ul connectorului asociat' },
    name: { type: 'string', doc: 'Denumire cheie (ex: Arges Mall PC1)' },
    is_active: { type: 'boolean', default: true, doc: 'Cheia e activa' },
    last_used: { type: 'datetime' },
    revoked_at: { type: 'datetime' },
  },
};

export const User = {
  name: 'User',
  required: [],
  fields: {
    email: { type: 'string' },
    full_name: { type: 'string' },
    role: { type: 'string', enum: ['admin', 'angajat'], default: 'angajat', doc: 'Rolul utilizatorului' },
    assigned_location: { type: 'string', doc: 'Locatia asignata (pentru angajati)' },
  },
};

export const AppSettings = {
  name: 'AppSettings',
  required: ['api_base_url'],
  fields: {
    api_base_url: {
      type: 'string',
      default: 'http://localhost:3001/api',
      doc: 'URL-ul de baza al API-ului bridge Dorsoft',
    },
    refresh_dashboard: { type: 'number', default: 15, doc: 'Interval refresh dashboard (secunde)' },
    refresh_charts: { type: 'number', default: 30, doc: 'Interval refresh grafice (secunde)' },
    refresh_reports: { type: 'number', default: 60, doc: 'Interval refresh rapoarte (secunde)' },
    shopify_store_url: { type: 'string', doc: 'URL magazin Shopify' },
    // NOTA: shopify_api_key / shopify_access_token au fost scoase intentionat.
    // Secretele Shopify nu au ce cauta intr-o entitate citibila din frontend
    // (plan.md §9). Ele stau in secret store-ul backend-ului, la Faza 4.
    theme: { type: 'string', enum: ['light', 'dark', 'auto'], default: 'dark' },
    locations: { type: 'array', default: [], doc: 'Locatii configurate: { name, type, active }' },
  },
};

export const SCHEMAS = { Connector, SyncEvent, ApiKey, User, AppSettings };

/**
 * Aplica default-urile din schema si taie cheile nedeclarate.
 * Fail-loud pe campuri obligatorii lipsa — principiul din plan.md §7.7:
 * mai bine o eroare vizibila decat date gresite in tacere.
 */
export function applySchema(schema, data, { partial = false } = {}) {
  const out = {};

  for (const [key, spec] of Object.entries(schema.fields)) {
    const has = Object.prototype.hasOwnProperty.call(data, key);

    if (!has) {
      if (!partial && spec.default !== undefined) out[key] = structuredClone(spec.default);
      continue;
    }

    let value = data[key];

    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }

    if (spec.enum && !spec.enum.includes(value)) {
      throw new Error(
        `${schema.name}.${key}: valoarea "${value}" nu e in enum [${spec.enum.join(', ')}]`,
      );
    }

    // Minimizare GDPR: pastreaza doar cheile permise explicit.
    if (spec.type === 'object' && spec.allowedKeys && typeof value === 'object') {
      value = Object.fromEntries(
        Object.entries(value).filter(([k]) => spec.allowedKeys.includes(k)),
      );
    }

    out[key] = value;
  }

  if (!partial) {
    const missing = schema.required.filter(
      (k) => out[k] === undefined || out[k] === null || out[k] === '',
    );
    if (missing.length) {
      throw new Error(`${schema.name}: campuri obligatorii lipsa — ${missing.join(', ')}`);
    }
  }

  return out;
}
