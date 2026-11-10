import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Tierras — pasaporte de viajes',
        short_name: 'Tierras',
        description:
          'Tu pasaporte personal de viajes: países, paradas y recuerdos. Compara con tus grupos cuando quieras.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/pasaporte',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        background_color: '#071a21',
        theme_color: '#071a21',
        categories: ['travel', 'social', 'lifestyle'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Abrir mi pasaporte',
            short_name: 'Pasaporte',
            url: '/pasaporte',
            description: 'Ver tus viajes, países y recuerdos',
          },
          {
            name: 'Abrir el mapa',
            short_name: 'Mapa',
            url: '/mapa',
            description: 'Ver el globo comparado del grupo',
          },
          {
            name: 'Ver el ranking',
            short_name: 'Ranking',
            url: '/ranking',
            description: 'Comparar los recorridos del grupo',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // El bundle incluye Three.js y el atlas geográfico; ~790 KB comprimido.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/api/account'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tierras-api-v1',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 3000,
  },
});
