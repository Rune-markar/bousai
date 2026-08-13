import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handleProductApi } from './server/productLookup.mjs';

function productApiPlugin() {
  return {
    name: 'sonae-product-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/products\/([^/?]+)/);
        if (!match || req.method !== 'GET') return next();
        await handleProductApi(req, res, decodeURIComponent(match[1]));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    productApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'characters/tomyo-hikari.png'],
      manifest: {
        name: 'そなえメモ',
        short_name: 'そなえメモ',
        description: '家庭の防災備蓄を、無理なく続けるためのアプリ',
        theme_color: '#153e38',
        background_color: '#f7f4ec',
        display: 'standalone',
        lang: 'ja',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          { urlPattern: /^https:\/\/images\.openfoodfacts\.org\//, handler: 'CacheFirst', options: { cacheName: 'product-images', expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }, cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /\/api\/products\//, handler: 'NetworkFirst', options: { cacheName: 'product-lookups', networkTimeoutSeconds: 5, expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 }, cacheableResponse: { statuses: [200] } } },
        ],
      },
    }),
  ],
});
