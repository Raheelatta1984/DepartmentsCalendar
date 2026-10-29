import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pageSecurityHeaders } from './server/security-headers.mjs';

// Vercel serves this SPA and the server-only api/ functions on one origin.
// Static-only hosts remain an explicitly labelled browser demo.
// See docs/DEPLOYMENT.md for the Neon Free setup.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    // The browser app, its assets and the API share one origin, so no
    // cross-origin read is ever needed. The Vite default only trusts
    // localhost; `true` would have granted every origin.
    cors: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
    cors: false,
    // `vite preview` serves the production bundle, so it enforces the same
    // policy the Vercel deployment ships (see vercel.json). HSTS and
    // upgrade-insecure-requests stay off: this port is plain HTTP.
    headers: pageSecurityHeaders({ enforceCsp: true }),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Split the vendor libraries so the app shell caches independently of data.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          dates: ['date-fns'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
