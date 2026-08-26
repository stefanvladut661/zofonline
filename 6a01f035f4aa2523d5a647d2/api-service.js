// Dorsoft Bridge API Service
// This service handles all communication with the local bridge API

const DEFAULT_API_URL = "http://localhost:3001/api";

let apiBaseUrl = DEFAULT_API_URL;

export function setApiBaseUrl(url) {
  apiBaseUrl = url || DEFAULT_API_URL;
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

async function fetchEndpoint(endpoint) {
  const url = `${apiBaseUrl}${endpoint}`;
  const response = await fetch(url, { 
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  return response.json();
}

export const DorsoftAPI = {
  getDashboard: () => fetchEndpoint('/dashboard'),
  getSales: () => fetchEndpoint('/sales'),
  getProducts: () => fetchEndpoint('/products'),
  getStock: () => fetchEndpoint('/stock'),
  getAlerts: () => fetchEndpoint('/alerts'),
  getTopProducts: () => fetchEndpoint('/top-products'),
  getLocations: () => fetchEndpoint('/locations'),
  getDailySales: () => fetchEndpoint('/daily-sales'),
  getMonthlySales: () => fetchEndpoint('/monthly-sales'),
  getShopifyOrders: () => fetchEndpoint('/shopify-orders'),
  getPerformance: () => fetchEndpoint('/performance'),
  getCategories: () => fetchEndpoint('/categories'),
  getBrands: () => fetchEndpoint('/brands'),
  testConnection: async () => {
    const start = Date.now();
    await fetchEndpoint('/dashboard');
    return { ok: true, latency: Date.now() - start };
  }
};