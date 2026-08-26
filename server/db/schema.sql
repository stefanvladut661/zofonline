-- Modelul de date central (plan.md §6).
-- Aceasta e sursa unica de adevar pentru stoc si vanzari.
--
-- Principii:
--   * UPSERT peste tot, niciodata INSERT simplu — retrimiterile agentului nu
--     trebuie sa dubleze nimic.
--   * Cheia de join intre toate sistemele (Dorsoft, dashboard, Shopify) = SKU.
--   * Fara identificatori de pacient nicaieri. Doar SKU, cantitate, pret,
--     locatie, timestamp (plan.md §9).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Locatii fizice + online ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  code                TEXT UNIQUE,
  type                TEXT NOT NULL DEFAULT 'fizic' CHECK (type IN ('fizic', 'online')),
  shopify_location_id TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Catalog de produse (rame, lentile) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  sku         TEXT PRIMARY KEY,
  name        TEXT,
  brand       TEXT,
  category    TEXT,
  size        TEXT,
  price       REAL,
  cost_price  REAL,
  image_url   TEXT,
  attributes  TEXT,                       -- JSON liber, specific vendorului
  status      TEXT NOT NULL DEFAULT 'activ',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_brand    ON products (brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- ─── Stoc per produs per locatie ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  sku         TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sku, location_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory (location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sku      ON inventory (sku);

-- ─── Vanzari ────────────────────────────────────────────────────────────────
-- source_ref = cheia de idempotenta din sistemul sursa (nr. bon / id tranzactie).
-- UNIQUE(location_id, source_ref) face retrimiterea agentului sigura.
CREATE TABLE IF NOT EXISTS sales (
  id          TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  quantity    INTEGER NOT NULL,
  unit_price  REAL NOT NULL,
  sold_at     TEXT NOT NULL,
  source_ref  TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'fizic' CHECK (channel IN ('fizic', 'online')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (location_id, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at  ON sales (sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_sku      ON sales (sku);
CREATE INDEX IF NOT EXISTS idx_sales_location ON sales (location_id);

-- ─── Agenti instalati in locatii ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connectors (
  id                          TEXT PRIMARY KEY,
  connector_id                TEXT NOT NULL UNIQUE,
  name                        TEXT,
  location_id                 TEXT NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  status                      TEXT NOT NULL DEFAULT 'offline'
                                CHECK (status IN ('online', 'offline', 'warning')),
  source_type                 TEXT NOT NULL DEFAULT 'dorsoft',
  agent_version               TEXT,
  last_heartbeat              TEXT,
  last_sync_time              TEXT,
  sync_count                  INTEGER NOT NULL DEFAULT 0,
  last_error_message          TEXT,
  dorsoft_sync_enabled        INTEGER NOT NULL DEFAULT 1,
  heartbeat_threshold_seconds INTEGER NOT NULL DEFAULT 90,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Chei API ───────────────────────────────────────────────────────────────
-- Cheia NU se stocheaza in clar. Se stocheaza:
--   key_hash   SHA-256, pentru cautare si detectarea duplicatelor
--   key_ct/iv/tag  cheia criptata AES-256-GCM cu ZOF_SECRET_KEY din mediu
-- Criptarea (nu doar hash) e necesara pentru ca serverul trebuie sa recalculeze
-- semnatura HMAC a agentului — vezi server/README.md.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_ct       TEXT NOT NULL,
  key_iv       TEXT NOT NULL,
  key_tag      TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  last_used    TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_keys_connector ON api_keys (connector_id);

-- ─── Jurnal de evenimente ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_events (
  id            TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  connector_id  TEXT NOT NULL,
  location_id   TEXT,
  location_name TEXT,
  source_type   TEXT NOT NULL DEFAULT 'dorsoft',
  timestamp     TEXT NOT NULL,
  payload       TEXT,                     -- JSON minimizat GDPR
  status        TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'warning')),
  error_message TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_events_ts        ON sync_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sync_events_connector ON sync_events (connector_id);

-- ─── Watermark de sincronizare per agent ────────────────────────────────────
-- Agentul cere doar inregistrarile cu modified_at > last_watermark (plan.md §7.3).
CREATE TABLE IF NOT EXISTS sync_state (
  connector_id     TEXT PRIMARY KEY,
  location_id      TEXT NOT NULL,
  last_watermark   TEXT,
  last_heartbeat_at TEXT,
  status           TEXT NOT NULL DEFAULT 'unknown',
  agent_version    TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Anti-replay pentru semnaturile agentilor ───────────────────────────────
CREATE TABLE IF NOT EXISTS seen_signatures (
  signature TEXT PRIMARY KEY,
  seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_seen_signatures_at ON seen_signatures (seen_at);

-- ─── Setari aplicatie (un singur rand) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id                TEXT PRIMARY KEY DEFAULT 'default',
  refresh_dashboard INTEGER NOT NULL DEFAULT 15,
  refresh_charts    INTEGER NOT NULL DEFAULT 30,
  refresh_reports   INTEGER NOT NULL DEFAULT 60,
  shopify_store_url TEXT,
  theme             TEXT NOT NULL DEFAULT 'dark',
  critical_stock_threshold INTEGER NOT NULL DEFAULT 3,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Utilizatori dashboard ──────────────────────────────────────────────────
-- Parola se stocheaza ca scrypt(parola, salt) — niciodata in clar, niciodata
-- reversibil. Primul cont se creeaza cu `npm run server:user`.
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name         TEXT,
  password_hash     TEXT NOT NULL,
  password_salt     TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'angajat' CHECK (role IN ('admin', 'angajat')),
  assigned_location TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  last_login        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
