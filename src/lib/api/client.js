/**
 * Clientul HTTP catre backend-ul Zof.
 *
 * Sesiunea vine dintr-un cookie HttpOnly, deci fiecare cerere merge cu
 * `credentials: 'include'`. Nu tinem niciun token in JavaScript — un XSS nu are
 * ce fura.
 */

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

let baseUrl = DEFAULT_BASE_URL;

export function setApiBaseUrl(url) {
  baseUrl = (url || DEFAULT_BASE_URL).replace(/\/$/, '');
}

export function getApiBaseUrl() {
  return baseUrl;
}

/**
 * Emis cand serverul raspunde 401 pe o cerere obisnuita: sesiunea a expirat sau
 * a fost invalidata. AuthContext asculta si intoarce utilizatorul la login.
 */
export const UNAUTHORIZED_EVENT = 'zof:unauthorized';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request(method, path, { body, timeoutMs = 15_000 } = {}) {
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Retea cazuta, server oprit, CORS, timeout — toate arata la fel aici.
    throw new ApiError(0, `Serverul nu raspunde la ${baseUrl}: ${err.message}`);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // /auth/me raspunde 401 cand nu esti logat — asta e normal la pornire, nu o
    // sesiune expirata, deci nu declansam evenimentul pentru el.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      globalThis.dispatchEvent?.(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, data?.error ?? `Eroare ${res.status}`);
  }
  return data;
}

export const http = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  delete: (path, opts) => request('DELETE', path, opts),
};
