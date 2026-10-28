import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      // Browser-accessible WSS in Codespaces; never connect to ws://localhost:3002
      // from a forwarded HTTPS URL. Proxy the socket over Vite's own origin.
      '/collab': {
        target: 'ws://127.0.0.1:3002',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/collab/, '') || '/',
      },
    },
  },
  preview: { host: '0.0.0.0', port: 4173 },
});
