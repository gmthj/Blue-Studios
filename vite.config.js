import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite is the dev server / build tool. The Vue plugin lets it read .vue files.
export default defineConfig({
  plugins: [vue()],
})
