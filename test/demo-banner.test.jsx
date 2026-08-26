/**
 * Verifica mecanismul care distinge datele reale de cele demo.
 *
 * Randare pe server (react-dom/server), fara browser: ne intereseaza doar
 * ce HTML iese pentru fiecare stare a sursei de date.
 */
import { renderToString } from 'react-dom/server';
import LiveBadge from '@/components/ui/LiveBadge';
import DemoDataBanner from '@/components/layout/DemoDataBanner';
import PageHeader from '@/components/ui/PageHeader';
import { markSource, demoFallback } from '@/lib/data-source';
import { ApiError } from '@/lib/api/client';

const has = (h, s) => h.includes(s);
let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('  OK   ' + n)) : (fail++, console.log('  FAIL ' + n)); };

console.log('\n--- Stare LIVE (bridge raspunde) ---');
markSource('dashboard', false);
let h = renderToString(<PageHeader title="Dashboard" lastUpdated={new Date().toISOString()} />);
ok('badge-ul arata Live', has(h, 'Live'));
ok('fara avertisment de demo', !has(h, 'Date demo'));
ok('banner ascuns', renderToString(<DemoDataBanner />) === '');

console.log('\n--- Stare DEMO (bridge picat) ---');
markSource('dashboard', true);
markSource('top-products', true);
h = renderToString(<PageHeader title="Dashboard" lastUpdated={new Date().toISOString()} />);
ok('badge-ul avertizeaza in loc de Live', has(h, 'Date demo') && !has(h, '>Live'));
ok('badge-ul e chihlimbariu, nu verde', has(h, 'amber') && !has(h, 'emerald'));
const b = renderToString(<DemoDataBanner />);
ok('banner-ul apare', b.length > 0);
ok('spune clar ca cifrele sunt inventate', has(b, 'date demo, inventate'));
ok('numara sectiunile afectate', has(b, '2 '));
ok('arata url-ul bridge-ului', has(b, 'localhost:3001'));
ok('are role=alert', has(b, 'role="alert"'));

console.log('\n--- demoFallback: cand cade pe demo si cand NU ---');
const DEMO = [{ fake: true }];

// Server oprit / retea cazuta -> ApiError cu status 0. Singurul caz in care
// fallback-ul pe date demo e corect.
ok('server inaccesibil -> date demo',
  (await demoFallback('t-unreachable',
    () => Promise.reject(new ApiError(0, 'Serverul nu raspunde')), DEMO)()) === DEMO);

// Sesiune expirata: a arata cifre inventate ar ascunde problema reala.
let threw401 = false;
try {
  await demoFallback('t-401', () => Promise.reject(new ApiError(401, 'Neautorizat')), DEMO)();
} catch (e) { threw401 = e.status === 401; }
ok('sesiune expirata (401) -> arunca, NU date demo', threw401);

let threw500 = false;
try {
  await demoFallback('t-500', () => Promise.reject(new ApiError(500, 'Eroare')), DEMO)();
} catch (e) { threw500 = e.status === 500; }
ok('eroare de server (500) -> arunca, NU date demo', threw500);

ok('succesul trece datele reale',
  (await demoFallback('t-ok', () => Promise.resolve(['real']), DEMO)())[0] === 'real');

console.log('\n--- Revenire pe LIVE ---');
markSource('t-unreachable', false);
markSource('dashboard', false);
markSource('top-products', false);
ok('banner-ul dispare', renderToString(<DemoDataBanner />) === '');

console.log('\n' + '='.repeat(40) + `\n  ${pass} trecute, ${fail} esuate\n` + '='.repeat(40));
if (fail) process.exitCode = 1;

