import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      ignored: ['**/public/videos/**', '**/public/audio/**', '**/public/images/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/videos': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/audio': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/images': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
