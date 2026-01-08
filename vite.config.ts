
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Custom plugin to copy manifest.json to dist on build
const copyManifest = () => {
  return {
    name: 'copy-manifest',
    closeBundle: async () => {
      const src = path.resolve(__dirname, 'manifest.json');
      const dest = path.resolve(__dirname, 'dist', 'manifest.json');
      if (fs.existsSync(src)) {
        if (!fs.existsSync(path.dirname(dest))) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
        }
        fs.copyFileSync(src, dest);
        console.log('manifest.json copied to dist');
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:7860'
    }
  }
});