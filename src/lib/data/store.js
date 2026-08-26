/**
 * Store-ul de entitati: leaga schema (validare + defaults + minimizare GDPR)
 * de un adaptor de persistenta (local sau http).
 *
 * Expune deliberat aceeasi suprafata pe care o apela deja codul existent
 * (`list('-created_date')`, `filter({...})`, `create`, `update`, `delete`),
 * ca detasarea de Base44 sa nu ceara rescrierea paginilor.
 */

import { SCHEMAS, applySchema } from './schema';

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Fallback pentru contexte fara WebCrypto (nu ar trebui atins in browserele tinta).
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createRepository(entityName, schema, adapter) {
  return {
    entityName,

    /** @param {string} [sort] ex. '-created_date'  @param {number} [limit] */
    list(sort, limit) {
      return adapter.list(entityName, { sort, limit });
    },

    /** @param {Record<string, unknown>} where potrivire pe egalitate stricta */
    filter(where, sort, limit) {
      return adapter.filter(entityName, where ?? {}, { sort, limit });
    },

    get(id) {
      return adapter.get(entityName, id);
    },

    create(data) {
      const now = new Date().toISOString();
      const record = {
        ...applySchema(schema, data ?? {}),
        id: newId(),
        created_date: now,
        updated_date: now,
      };
      return adapter.create(entityName, record);
    },

    update(id, patch) {
      const clean = applySchema(schema, patch ?? {}, { partial: true });
      return adapter.update(entityName, id, { ...clean, updated_date: new Date().toISOString() });
    },

    delete(id) {
      return adapter.remove(entityName, id);
    },
  };
}

export function createStore(adapter, schemas = SCHEMAS) {
  const entities = {};
  for (const [name, schema] of Object.entries(schemas)) {
    entities[name] = createRepository(name, schema, adapter);
  }

  return {
    adapter: adapter.name,
    entities,
  };
}
