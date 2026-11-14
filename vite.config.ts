import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'DairyDirect Admin Portal',
        short_name: 'DairyDirect',
        description: 'Manage farms, cities, orders, deliveries, finance and staff.',
        theme_color: '#2E7D1A',
        background_color: '#F6F9F3',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            // OpenStreetMap tiles — cache-first, capped
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    ...(mode === 'analyze'
      ? [visualizer({ filename: 'stats.html', json: true, gzipSize: true, brotliSize: true, template: 'treemap' })]
      : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    manifest: true,
    chunkSizeWarningLimit: 120,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]react-dom[\\/]|[\\/]node_modules[\\/]react[\\/]|scheduler/.test(id)) return 'react'
          if (id.includes('react-router') || id.includes('@remix-run')) return 'router'
          if (id.includes('motion-dom') || id.includes('motion-utils') || id.includes('motion-design') || id.includes('motion-player')) return 'motion'
          if (id.includes('tslib')) return 'motion'
          if (id.includes('workbox') || id.includes('vite-plugin-pwa')) return 'pwa'
          if (id.includes('@tanstack')) return 'query'
          if (id.includes('recharts') || id.includes('d3-') || id.includes('react-smooth') || id.includes('victory') || id.includes('lodash') || /[\\/]prop-types[\\/]|[\\/]react-is[\\/]/.test(id)) return 'charts'
          if (id.includes('leaflet')) return 'maps'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('xlsx') || id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify') || id.includes('purify') || id.includes('canvg') || id.includes('fflate') || id.includes('core-js') || id.includes('@babel/runtime')) return 'exporters'
          if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform')) return 'forms'
          if (id.includes('sonner')) return 'toasts'
          if (id.includes('decimal.js-light') || id.includes('performance-now') || id.includes('raf/') || id.includes('rgbcolor') || id.includes('svg-pathdata') || id.includes('stackblur-canvas') || id.includes('canvaskit')) return 'exporters'
          if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('clsx') || id.includes('tailwind-merge') || id.includes('class-variance-authority') || id.includes('react-remove-scroll') || id.includes('use-sidecar') || id.includes('use-callback-ref') || id.includes('react-style-singleton') || id.includes('@floating-ui')) return 'ui'
          if (id.includes('@supabase')) return 'supabase'
          return 'vendor'
        },
      },
    },
  },
  server: { port: 5173 },
}))
