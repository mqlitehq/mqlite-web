import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' → relative asset URLs, so the built dist can be served from any mount
// point (e.g. the broker embeds it at /ui/) without rewriting paths.
// The dev proxy forwards the broker's API to a local `mqlite serve` on :8080.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/mqlite.v1.': { target: 'http://localhost:8080', changeOrigin: true },
      '/metrics': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
})
