import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local print service (server/index.js)
      '/api': 'http://localhost:3777',
    },
  },
})
