import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // manifest: scripts/seo.mjs adds <link rel=modulepreload> for each public page's own files (faster first paint)
  build: { manifest: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
