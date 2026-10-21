import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
