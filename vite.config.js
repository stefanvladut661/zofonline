import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    // Alias-ul `@` era furnizat de @base44/vite-plugin. Dupa detasarea de Base44
    // il declaram noi, aliniat cu "paths" din jsconfig.json.
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    outDir: 'dist',
    // In productie nu trimitem source maps: sunt ~6 MB care s-ar consuma din
    // traficul lunar gratuit si ar publica sursa oricui deschide devtools.
    // Le poti cere oricand inapoi cu: SOURCEMAP=true npm run build
    sourcemap: process.env.SOURCEMAP === 'true' || mode !== 'production',
  },
}));
