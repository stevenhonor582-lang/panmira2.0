import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/web/',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    // Output to a staging dir first, then copy to dist/web/ via the build
    // script (which also runs tsc, so dist/web/ already has the backend's
    // ws-server.js etc.). This avoids vite deleting backend files when
    // emptyOutDir is true, and avoids stale chunks accumulating.
    outDir: '../dist/web-staging',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          markdown: ['react-markdown', 'remark-gfm', 'rehype-highlight'],
          'office-preview': ['docx-preview', 'xlsx'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:9100',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9100',
        ws: true,
      },
      '/memory': {
        target: 'http://localhost:8100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/memory/, ''),
      },
    },
  },
});
