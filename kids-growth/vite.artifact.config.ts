import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 单文件(Artifact)构建:无 PWA、hash 路由,产物由 scripts/build-artifact.mjs 内联成一个 HTML
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_ARTIFACT': JSON.stringify('1'),
  },
  build: {
    outDir: 'dist-artifact',
    // 单 chunk,便于内联
    rollupOptions: { output: { manualChunks: undefined } },
    chunkSizeWarningLimit: 2000,
  },
})
