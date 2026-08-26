import http from 'node:http';
import { openDatabase } from './db/index.js';
import { authenticateAgent } from './lib/agent-auth.js';
import {
  HttpError, applyCors, badRequest, createRouter, readRawBody, sendJson,
} from './lib/http.js';
import {
  authenticate, clearCookie, createSessionToken, currentUser,
  requireAdmin, requireUser, sessionCookie,
} from './lib/session.js';
import { handleHeartbeat, handleIngest, handleSyncState, sweepStaleConnectors } from './routes/ingest.js';
import * as dash from './routes/dashboard.js';
import * as admin from './routes/admin.js';

const PORT = Number(process.env.PORT) || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';
const CORS_ORIGINS = (process.env.ZOF_CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174,http://localhost:5175')
  .split(',').map((s) => s.trim()).filter(Boolean);

const router = createRouter();

// ─── Agenti din locatii (autentificare HMAC) ─────────────────────────────────
// Singurele rute pe care le apeleaza bridge-ul instalat in magazine.

router.post('/api/ingest', async (ctx) => {
  const auth = authenticateAgent(ctx.req, ctx.rawBody);
  return handleIngest({ connector: auth.connector, body: ctx.body ?? {} });
});

router.post('/api/heartbeat', async (ctx) => {
  const auth = authenticateAgent(ctx.req, ctx.rawBody);
  return handleHeartbeat({ connector: auth.connector, body: ctx.body ?? {} });
});

router.get('/api/sync-state', async (ctx) => {
  const auth = authenticateAgent(ctx.req, ctx.rawBody);
  return handleSyncState({ connector: auth.connector });
});

// ─── Autentificare dashboard ─────────────────────────────────────────────────

router.post('/api/auth/login', async (ctx) => {
  const email = String(ctx.body?.email ?? '').trim();
  const password = String(ctx.body?.password ?? '');
  if (!email || !password) throw badRequest('email si password sunt obligatorii');

  const user = authenticate(email, password);
  if (!user) throw new HttpError(401, 'Email sau parola gresita');

  ctx.res.setHeader('Set-Cookie', sessionCookie(createSessionToken(user.id), { secure: IS_PROD }));
  return user;
});

router.post('/api/auth/logout', async (ctx) => {
  ctx.res.setHeader('Set-Cookie', clearCookie({ secure: IS_PROD }));
  return { ok: true };
});

router.get('/api/auth/me', async (ctx) => requireUser(ctx.req));

// ─── Citire pentru dashboard (necesita sesiune) ──────────────────────────────
// Formele returnate respecta contractul din src/lib/api-service.js.

const READ_ROUTES = {
  '/api/dashboard': () => dash.getDashboard(),
  '/api/sales': (q) => dash.getSales({ limit: q.get('limit') }),
  '/api/products': () => dash.getProducts(),
  '/api/stock': () => dash.getStock(),
  '/api/alerts': () => dash.getAlerts(),
  '/api/top-products': (q) => dash.getTopProducts({ limit: q.get('limit') }),
  '/api/locations': () => dash.getLocations(),
  '/api/daily-sales': (q) => dash.getDailySales({ days: q.get('days') }),
  '/api/monthly-sales': (q) => dash.getMonthlySales({ months: q.get('months') }),
  '/api/shopify-orders': (q) => dash.getShopifyOrders({ limit: q.get('limit') }),
  '/api/performance': () => dash.getPerformance(),
  '/api/categories': () => dash.getCategories(),
  '/api/brands': () => dash.getBrands(),
};

for (const [path, handler] of Object.entries(READ_ROUTES)) {
  router.get(path, async (ctx) => {
    requireUser(ctx.req);
    return handler(ctx.query);
  });
}

// ─── Administrare (necesita rol admin) ───────────────────────────────────────

router.get('/api/health', async () => admin.getHealth());

router.get('/api/admin/locations', async (ctx) => { requireUser(ctx.req); return admin.listLocations(); });
router.post('/api/admin/locations', async (ctx) => { requireAdmin(ctx.req); return admin.createLocation(ctx.body); });
router.patch('/api/admin/locations/:id', async (ctx) => { requireAdmin(ctx.req); return admin.updateLocation(ctx.params.id, ctx.body); });

router.get('/api/admin/connectors', async (ctx) => { requireAdmin(ctx.req); return admin.listConnectors(); });
router.post('/api/admin/connectors', async (ctx) => { requireAdmin(ctx.req); return admin.createConnector(ctx.body); });
router.patch('/api/admin/connectors/:id', async (ctx) => { requireAdmin(ctx.req); return admin.updateConnector(ctx.params.id, ctx.body); });
router.delete('/api/admin/connectors/:id', async (ctx) => { requireAdmin(ctx.req); return admin.deleteConnector(ctx.params.id); });
router.post('/api/admin/connectors/:connectorId/rotate-key', async (ctx) => { requireAdmin(ctx.req); return admin.rotateApiKey(ctx.params.connectorId); });

router.get('/api/admin/sync-events', async (ctx) => { requireAdmin(ctx.req); return admin.listSyncEvents({ limit: ctx.query.get('limit') }); });

router.get('/api/admin/settings', async (ctx) => { requireUser(ctx.req); return admin.getSettings(); });
router.patch('/api/admin/settings', async (ctx) => { requireAdmin(ctx.req); return admin.updateSettings(ctx.body); });

// ─── Server ──────────────────────────────────────────────────────────────────

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    applyCors(req, res, CORS_ORIGINS);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const route = router.match(req.method, url.pathname);
    if (!route) {
      sendJson(res, 404, { error: 'Ruta inexistenta', path: url.pathname });
      return;
    }

    try {
      // Corpul brut se pastreaza ca text: semnatura HMAC a agentului se
      // calculeaza pe bytes exacti, nu pe JSON-ul re-serializat.
      const rawBody = req.method === 'GET' || req.method === 'DELETE' ? '' : await readRawBody(req);
      let body = null;
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          throw badRequest('Corpul cererii nu e JSON valid');
        }
      }

      const result = await route.handler({
        req, res, body, rawBody, params: route.params, query: url.searchParams,
      });
      if (!res.writableEnded) sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message, ...err.extra });
      } else {
        // Mesajul intern nu ajunge la client — poate contine detalii de schema.
        console.error(`[${new Date().toISOString()}] ${req.method} ${url.pathname}:`, err);
        sendJson(res, 500, { error: 'Eroare interna de server' });
      }
    }
  });
}

export function startServer({ port = PORT } = {}) {
  if (!process.env.ZOF_SECRET_KEY) {
    console.error(
      '\nZOF_SECRET_KEY lipseste din mediu. Genereaza una si pune-o in .env:\n' +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n",
    );
    process.exit(1);
  }

  openDatabase();

  // Fara asta, un agent cazut ar ramane „online" pe dashboard la nesfarsit —
  // exact pericolul din plan.md §7.8.
  const sweep = setInterval(() => {
    try {
      const n = sweepStaleConnectors();
      if (n) console.log(`[sweep] ${n} agent(i) trecut(i) in offline`);
    } catch (err) {
      console.error('[sweep] esuat:', err.message);
    }
  }, 30_000);
  sweep.unref();

  const server = createServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n  Portul ${port} e deja folosit de alt proces.\n` +
        '  Schimba PORT in .env, sau opreste procesul care il ocupa.\n',
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, () => {
    console.log(`\n  Zof API  →  http://localhost:${port}`);
    console.log(`  CORS     →  ${CORS_ORIGINS.join(', ')}`);
    console.log(`  Mediu    →  ${IS_PROD ? 'productie' : 'dezvoltare'}\n`);
  });
  return server;
}
