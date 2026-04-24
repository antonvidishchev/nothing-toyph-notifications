import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  base: './',
  server: {
    port: 3101,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
