import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '小朋友成长系统',
        short_name: '成长系统',
        description: '家庭自用的小朋友成长记录与习惯养成系统',
        theme_color: '#FF8FA3',
        background_color: '#FFF7F0',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
        // 朗读音频(有道/百度/Google)缓存起来:重复播放秒响,离线也能读之前听过的
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(dict\.youdao\.com|tts\.baidu\.com|fanyi\.baidu\.com|translate\.google\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-audio',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
