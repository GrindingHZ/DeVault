import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      // A developer running a second api, for instance one on the chain drivers
      // beside the demo, points the proxy at it without editing this file.
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
});
