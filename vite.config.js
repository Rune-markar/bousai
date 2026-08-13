import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handleProductApi, handleProductImageApi } from './server/productLookup.mjs';
import { getAccessInfo } from './server/accessInfo.mjs';

const APP_BASE = process.env.APP_BASE || '/';

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

export default defineConfig({
  base: APP_BASE,
  plugins: [
    react(),
    productApiPlugin(),
    VitePWA({
      scope: APP_BASE,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'characters/*.webp'],
      manifest: {
        name: 'そなえメモ',
        short_name: 'そなえメモ',
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
        globPatterns: ['**/*.{js,css,html,svg,webp}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          { urlPattern: /^https:\/\/images\.openfoodfacts\.org\//, handler: 'CacheFirst', options: { cacheName: 'product-images', expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }, cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /\/api\/products\//, handler: 'NetworkFirst', options: { cacheName: 'product-lookups', networkTimeoutSeconds: 5, expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 }, cacheableResponse: { statuses: [200] } } },
        ],
      },
    }),
  ],
});
