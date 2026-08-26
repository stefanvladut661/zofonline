/**
 * Router minimal peste node:http.
 *
 * Deliberat fara Express: serverul asta ajunge pe un VPS mic si vrem cat mai
 * putina suprafata de dependinte. Sunt ~40 de rute simple, nu justifica un
 * framework.
 */

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new HttpError(400, msg, extra);
export const unauthorized = (msg = 'Neautorizat') => new HttpError(401, msg);
export const forbidden = (msg = 'Interzis') => new HttpError(403, msg);
export const notFound = (msg = 'Negasit') => new HttpError(404, msg);

export function createRouter() {
  /** @type {Array<{method: string, pattern: RegExp, keys: string[], handler: Function}>} */
  const routes = [];

  function add(method, template, handler) {
    const keys = [];
    const pattern = new RegExp(
      '^' +
        template
          .replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => {
            keys.push(k);
            return '/([^/]+)';
          })
          .replace(/\*/g, '.*') +
        '/?$',
    );
    routes.push({ method, pattern, keys, handler });
  }

  return {
    get: (t, h) => add('GET', t, h),
    post: (t, h) => add('POST', t, h),
    patch: (t, h) => add('PATCH', t, h),
    put: (t, h) => add('PUT', t, h),
    delete: (t, h) => add('DELETE', t, h),

    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const m = pathname.match(route.pattern);
        if (!m) continue;
        const params = {};
        route.keys.forEach((k, i) => {
          params[k] = decodeURIComponent(m[i + 1]);
        });
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/** Citeste corpul brut. Il pastram ca text: semnatura HMAC se face pe bytes exacti. */
export function readRawBody(req, { limitBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new HttpError(413, 'Payload prea mare'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function applyCors(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  const allowAll = allowedOrigins.includes('*');
  if (origin && (allowAll || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Connector-Id, X-Timestamp, X-Signature',
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}
