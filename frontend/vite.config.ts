import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The backend runs on port 4321; dev server proxies /api so the browser only
// ever talks to one origin (no CORS issues in development).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'عِش آمن — AishAman',
        short_name: 'عِش آمن',
        description: 'نظامك الشخصي للمهام والذاكرة واليوميات والأهداف',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/#/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f7faf7',
        theme_color: '#2e7d32',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-font-styles', expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-font-files', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    allowedHosts: [
      'work-1-viuqgmodmmucjhpx.prod-runtime.all-hands.dev',
      'work-2-viuqgmodmmucjhpx.prod-runtime.all-hands.dev',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:4321',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'cloud-vendor': ['@supabase/supabase-js', 'idb'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom', 'zustand'],
        },
      },
    },
  },
});
