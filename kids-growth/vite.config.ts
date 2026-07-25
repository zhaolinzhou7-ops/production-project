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
        // 注意:不要用 Service Worker 缓存朗读音频。<audio> 会发 Range 请求,
        // 经 SW 转发后在部分浏览器(尤其 iOS)会播放失败;音频改由浏览器 HTTP
        // 缓存自然复用即可,正确性优先于省流量。
      },
    }),
  ],
})
