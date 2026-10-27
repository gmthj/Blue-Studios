import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite is the dev server / build tool. The Vue plugin lets it read .vue files.
export default defineConfig({
  plugins: [vue()],
  // FFmpeg.wasm starts its own web worker from a file next to it, which breaks if Vite
  // pre-bundles the package in dev mode. So Vite leaves these two packages as they are.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  test: {
    environment: 'jsdom',
  },
})
