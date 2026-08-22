import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The backend serves these paths directly in production (PROJECT.md 10.2 -
// FastAPI serves the built frontend). In dev, Vite and uvicorn run on
// separate ports, so proxy /items to the real backend instead of dealing
// with CORS.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PROJECT.md 10.8. generateSW (not injectManifest) - this app needs
    // nothing beyond app-shell caching and installability, no custom
    // offline logic worth hand-writing a service worker for.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Notes Inbox',
        short_name: 'Notes',
        description: 'Review, enrich, and file captured notes',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ede6ff',
        theme_color: '#7e14ff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Never let the SPA-navigation fallback intercept an /api/* request
        // - those must always reach the backend live (auth, item mutations,
        // chat). Only static app-shell files are precached; nothing here
        // caches API responses.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
