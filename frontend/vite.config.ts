import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serve the static Our Partners page for the clean /partner and /player URLs
// on the dev server (Apache handles this via .htaccess in production).
const partnerCleanUrls = {
  name: 'partner-clean-urls',
  configureServer(server: any) {
    server.middlewares.use((req: any, _res: any, next: any) => {
      const path = (req.url || '').split('?')[0].replace(/\/$/, '')
      if (path === '/partner' || path === '/player') req.url = '/partner.html'
      next()
    })
  },
}

// The PHP API runs under WAMP Apache at /frantz-portfolio/api.
// Proxying /api keeps the browser same-origin so PHP sessions (cookies) work.
export default defineConfig({
  plugins: [react(), partnerCleanUrls],
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
