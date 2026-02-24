import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import webmcp from 'webmcp-instrument-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    webmcp({ include: ['src/**/*.tsx'] })
  ],
})
