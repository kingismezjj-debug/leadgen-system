import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    rollupOptions: {
      input: path.resolve(root, 'index.html')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5190,
    proxy: {
      '/api': 'http://127.0.0.1:8790'
    }
  }
});
