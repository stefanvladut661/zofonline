import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Coloane adaugate dupa prima versiune a schemei. CREATE TABLE IF NOT EXISTS nu
 * modifica un tabel care exista deja, deci bazele vechi le primesc aici, o
 * singura data. Lista creste doar prin adaugare la sfarsit.
 */
const ADDED_COLUMNS = [
  ['sync_state', 'data_as_of', 'TEXT'],
  ['sync_state', 'data_source_file', 'TEXT'],
];

function addMissingColumns(conn) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const existing = conn.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!existing.includes(column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/**
 * Deschide baza si aplica schema. Schema e scrisa cu CREATE TABLE IF NOT EXISTS,
 * deci rularea repetata e sigura.
 */
export function openDatabase(file = process.env.ZOF_DB_FILE || path.join(here, '..', 'data', 'zof.db')) {
  if (db) return db;

  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  db = new DatabaseSync(file);
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  addMissingColumns(db);
  return db;
}

export function getDatabase() {
  if (!db) throw new Error('Baza nu e deschisa. Cheama openDatabase() intai.');
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Ruleaza fn intr-o tranzactie; rollback automat daca arunca. */
export function transaction(fn) {
  const conn = getDatabase();
  conn.exec('BEGIN');
  try {
    const result = fn(conn);
    conn.exec('COMMIT');
    return result;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}

export const all = (sql, ...params) => getDatabase().prepare(sql).all(...params);
export const get = (sql, ...params) => getDatabase().prepare(sql).get(...params) ?? null;
export const run = (sql, ...params) => getDatabase().prepare(sql).run(...params);
