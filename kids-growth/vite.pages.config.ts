import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 构建:托管在 https://<user>.github.io/production-project/ 子路径下,
// 静态托管无服务端路由,复用 VITE_ARTIFACT 开关走 hash 路由;保留 PWA(可添加到主屏幕、离线)。
export default defineConfig({
  base: '/production-project/',
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
        start_url: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
      },
    }),
  ],
  define: {
    'import.meta.env.VITE_ARTIFACT': JSON.stringify('1'),
  },
  build: {
    outDir: 'dist-pages',
    rollupOptions: { output: { manualChunks: undefined } },
    chunkSizeWarningLimit: 2000,
  },
})
