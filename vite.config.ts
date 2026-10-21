import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The portal is a static SPA. It is designed to be hosted free on Vercel,
// Netlify, Cloudflare Pages or GitHub Pages, with an optional free Supabase
// project for the shared database (see docs/ARCHITECTURE.md).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
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
