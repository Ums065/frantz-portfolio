import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The PHP API runs under WAMP Apache at /frantz-portfolio/api.
// Proxying /api keeps the browser same-origin so PHP sessions (cookies) work.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost/frantz-portfolio/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
