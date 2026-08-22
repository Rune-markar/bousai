import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handleProductApi, handleProductImageApi } from './server/productLookup.mjs';
import { getAccessInfo } from './server/accessInfo.mjs';
import { resolveAppEnvironment } from './src/appEnvironment.js';

function productApiPlugin() {
  return {
    name: 'sonae-product-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/products\/([^/?]+)/);
        if (match && req.method === 'GET') return handleProductApi(req, res, decodeURIComponent(match[1]));
        const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (requestUrl.pathname === '/api/product-image' && req.method === 'GET') {
          return handleProductImageApi(req, res, requestUrl.searchParams.get('url') || '');
        }
        if (requestUrl.pathname === '/api/access-info' && req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(getAccessInfo(req)));
          return;
        }
        return next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const loadedEnvironment = loadEnv(mode, process.cwd(), '');
  const environment = resolveAppEnvironment(process.env.VITE_APP_ENV || loadedEnvironment.VITE_APP_ENV || (mode === 'demo' ? 'demo' : 'local'));
  const appBase = process.env.APP_BASE || loadedEnvironment.APP_BASE || '/';

  return {
    base: appBase,
    define: { 'import.meta.env.VITE_APP_ENV': JSON.stringify(environment.id) },
    build: { outDir: environment.isDemo ? 'dist-demo' : 'dist' },
    server: { port: environment.isDemo ? 5174 : 5173, strictPort: true },
    preview: { port: environment.isDemo ? 4174 : 4173, strictPort: true },
    plugins: [
      react(),
      ...(environment.appApiEnabled ? [productApiPlugin()] : []),
      VitePWA({
        scope: appBase,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'characters/*.webp'],
        manifest: {
          id: `${appBase}?app-environment=${environment.id}`,
          name: `そなえメモ${environment.isDemo ? ' デモ' : ''}`,
          short_name: `そなえメモ${environment.isDemo ? ' Demo' : ''}`,
          description: '家庭の防災備蓄を、無理なく続けるためのアプリ',
          theme_color: '#153e38',
          background_color: '#f7f4ec',
          display: 'standalone',
          lang: 'ja',
          start_url: './',
          scope: './',
          icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
        },
        workbox: {
          cacheId: `sonae-note-${environment.id}`,
          globPatterns: ['**/*.{js,css,html,svg,webp}'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: 'index.html',
          runtimeCaching: [
            { urlPattern: /^https:\/\/images\.openfoodfacts\.org\//, handler: 'CacheFirst', options: { cacheName: `product-images-${environment.id}`, expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }, cacheableResponse: { statuses: [0, 200] } } },
            { urlPattern: ({ url }) => url.pathname.includes('/api/products/') || (url.origin === 'https://world.openfoodfacts.org' && url.pathname.includes('/api/v3/product/')), handler: 'NetworkFirst', options: { cacheName: `product-lookups-${environment.id}`, networkTimeoutSeconds: 5, expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 }, cacheableResponse: { statuses: [0, 200] } } },
          ],
        },
      }),
    ],
  };
});
