/**
 * Adaptor HTTP catre backend-ul central propriu.
 *
 * NU e cablat inca — backend-ul se construieste la Faza 1 (plan.md §11).
 * Exista aici ca sa fixeze contractul REST din timp: cand serverul e gata,
 * src/lib/data/index.js schimba `createLocalAdapter()` in `createHttpAdapter(url)`
 * si nimic altceva din aplicatie nu se modifica.
 *
 * Contract asteptat de la server:
 *   GET    /entities/:entity?sort=-created_date&limit=100
 *   GET    /entities/:entity?where=<json-urlencoded>&sort=...&limit=...
 *   GET    /entities/:entity/:id
 *   POST   /entities/:entity
 *   PATCH  /entities/:entity/:id
 *   DELETE /entities/:entity/:id
 */

export function createHttpAdapter(baseUrl, { getToken, timeoutMs = 10_000 } = {}) {
  if (!baseUrl) throw new Error('[data/http] baseUrl lipseste');

  async function request(method, path, body) {
    const token = getToken?.();
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`[data/http] ${method} ${path} → ${res.status} ${text}`.trim());
      err.status = res.status;
      throw err;
    }

    return res.status === 204 ? null : res.json();
  }

  function qs({ where, sort, limit } = {}) {
    const p = new URLSearchParams();
    if (where && Object.keys(where).length) p.set('where', JSON.stringify(where));
    if (sort) p.set('sort', sort);
    if (limit) p.set('limit', String(limit));
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  return {
    name: 'http',
    list: (entity, opts) => request('GET', `/entities/${entity}${qs(opts)}`),
    filter: (entity, where, opts) => request('GET', `/entities/${entity}${qs({ ...opts, where })}`),
    get: (entity, id) => request('GET', `/entities/${entity}/${encodeURIComponent(id)}`),
    create: (entity, record) => request('POST', `/entities/${entity}`, record),
    update: (entity, id, patch) => request('PATCH', `/entities/${entity}/${encodeURIComponent(id)}`, patch),
    remove: (entity, id) => request('DELETE', `/entities/${entity}/${encodeURIComponent(id)}`),
  };
}
