import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import webmcp from 'webmcp-instrument-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    webmcp({ include: ['src/**/*.vue'] })
  ],
})
