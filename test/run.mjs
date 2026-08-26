/**
 * Runner pentru suita de teste.
 *
 * Testele importa cu alias-ul '@/...' si ruleaza cod scris pentru browser, deci
 * le bundluim cu esbuild (deja instalat, vine cu Vite) si le rulam in Node peste
 * un shim minim de localStorage. Fara framework de test — nu merita o dependinta
 * noua pentru atat.
 *
 * Rulare:  npm test
 */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outdir = path.join(here, '.build');

const SUITES = ['demo-banner.test.jsx', 'pages.test.jsx'];

await build({
  entryPoints: SUITES.map((f) => path.join(here, f)),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outdir,
  absWorkingDir: root,
  alias: { '@': path.join(root, 'src') },
  define: {
    // Vite injecteaza import.meta.env; in Node nu exista, deci il definim aici.
    'import.meta.env': JSON.stringify({ PROD: false, DEV: true, MODE: 'test' }),
    'process.env.NODE_ENV': '"production"',
  },
  jsx: 'automatic',
  logLevel: 'warning',
  // react-dom/server e CJS si cere module native ('stream'). Intr-un bundle ESM
  // asta pica pe "Dynamic require not supported" — banner-ul reface `require`.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});

// localStorage nu exista stabil in Node; adaptorul local il cere.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

try {
  for (const suite of SUITES) {
    const out = path.join(outdir, suite.replace(/\.jsx$/, '.js'));
    await import(pathToFileURL(out).href);
  }
} finally {
  fs.rmSync(outdir, { recursive: true, force: true });
}

if (process.exitCode) {
  console.error('\nSuita a esuat.');
}
