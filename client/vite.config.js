import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// After every production build (whatever command the host runs: `vite build`, `npm run build`, …) write the
// search-engine pages, sitemap.xml, robots.txt and llms.txt. Without this step Google sees only an empty app shell.
const seo = () => {
  let outDir = 'dist';
  return {
    name: 'sat-ustoz-seo',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    closeBundle() { execFileSync(process.execPath, [path.join(here, 'scripts/seo.mjs'), outDir], { stdio: 'inherit' }); },
  };
};

export default defineConfig({
  plugins: [react(), seo()],
  // manifest: scripts/seo.mjs adds <link rel=modulepreload> for each public page's own files (faster first paint)
  build: { manifest: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
