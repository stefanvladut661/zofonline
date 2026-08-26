import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
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
    sourcemap: true,
  },
});
