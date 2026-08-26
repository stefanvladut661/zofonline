import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let db = null;

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
