import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      includeAssets: ['favicon.png', 'favicon.svg', 'icons.svg', 'pwa-192.png', 'pwa-512.png', 'og-image.png'],
      manifest: {
        name: 'SolveIQ — Draw & Solve',
        short_name: 'SolveIQ',
        description: 'An intelligent canvas where you draw and solve math equations in real-time.',
        theme_color: '#0c0d0e',
        background_color: '#0c0d0e',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => {
              return url.pathname.includes('/calculate') ||
                     url.pathname.includes('/copilot') ||
                     url.pathname.includes('/history') ||
                     url.pathname.includes('/share')
            },
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
