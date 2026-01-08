import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist', // Build output goes here
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Proxy API requests to the Express server during development
      '/api': 'http://localhost:7860'
    }
  }
});