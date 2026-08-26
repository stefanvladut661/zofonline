/**
 * Suprafata de API a aplicatiei.
 *
 * Inainte se numea DorsoftAPI si tintea un „bridge" pe http://localhost:3001 —
 * adica presupunea ca browserul owner-ului ruleaza pe aceeasi masina cu
 * calculatorul din magazin. Asta contrazicea chiar scopul proiectului: sa vezi
 * vanzarile fara sa mergi fizic in locatii.
 *
 * Acum tinteste backend-ul central propriu (server/). Formele returnate sunt
 * identice cu cele de dinainte, deci componentele nu s-au schimbat.
 */

import { http } from './api/client';

export { setApiBaseUrl, getApiBaseUrl, ApiError } from './api/client';

const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const ZofAPI = {
  // ─── Citire pentru dashboard ───────────────────────────────────────────────
  getDashboard: () => http.get('/dashboard'),
  getSales: (params) => http.get(`/sales${qs(params)}`),
  getProducts: () => http.get('/products'),
  getStock: () => http.get('/stock'),
  getAlerts: () => http.get('/alerts'),
  getTopProducts: (params) => http.get(`/top-products${qs(params)}`),
  getLocations: () => http.get('/locations'),
  getDailySales: (params) => http.get(`/daily-sales${qs(params)}`),
  getMonthlySales: (params) => http.get(`/monthly-sales${qs(params)}`),
  getShopifyOrders: (params) => http.get(`/shopify-orders${qs(params)}`),
  getPerformance: () => http.get('/performance'),
  getCategories: () => http.get('/categories'),
  getBrands: () => http.get('/brands'),

  // ─── Autentificare ─────────────────────────────────────────────────────────
  auth: {
    login: (email, password) => http.post('/auth/login', { email, password }),
    logout: () => http.post('/auth/logout'),
    me: () => http.get('/auth/me'),
  },

  // ─── Administrare ──────────────────────────────────────────────────────────
  admin: {
    health: () => http.get('/health'),

    listLocations: () => http.get('/admin/locations'),
    createLocation: (data) => http.post('/admin/locations', data),
    updateLocation: (id, data) => http.patch(`/admin/locations/${encodeURIComponent(id)}`, data),

    listConnectors: () => http.get('/admin/connectors'),
    createConnector: (data) => http.post('/admin/connectors', data),
    updateConnector: (id, data) => http.patch(`/admin/connectors/${encodeURIComponent(id)}`, data),
    deleteConnector: (id) => http.delete(`/admin/connectors/${encodeURIComponent(id)}`),
    rotateKey: (connectorId) =>
      http.post(`/admin/connectors/${encodeURIComponent(connectorId)}/rotate-key`),

    listSyncEvents: (params) => http.get(`/admin/sync-events${qs(params)}`),

    getSettings: () => http.get('/admin/settings'),
    updateSettings: (data) => http.patch('/admin/settings', data),
  },

  /** Verifica daca backend-ul raspunde si cat de repede. */
  testConnection: async () => {
    const start = Date.now();
    const health = await http.get('/health');
    return { ok: true, latency: Date.now() - start, health };
  },
};

export default ZofAPI;
