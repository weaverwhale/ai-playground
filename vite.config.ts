import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist/frontend',
    rollupOptions: {
      external: [
        /^backend\/.*/, // Prevents importing from backend directory
      ],
    },
  },
});
