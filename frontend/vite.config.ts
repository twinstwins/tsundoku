import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  const origin = new URL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  return {
    plugins: [react()],
    base: command === 'serve' ? '/' : '/frontend/',
    server: {
      host: '0.0.0.0', port: 5173, strictPort: true,
      origin: origin.origin,
      allowedHosts: ['frontend'],
      cors: { origin: process.env.RAILS_ORIGIN || 'http://localhost:3000' },
      hmr: { host: origin.hostname, clientPort: Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)), protocol: origin.protocol === 'https:' ? 'wss' : 'ws' },
      watch: { usePolling: process.env.VITE_USE_POLLING === '1' },
    },
    build: {
      outDir: '../public/frontend', emptyOutDir: true, manifest: true,
      rollupOptions: { input: 'src/entrypoints/application.tsx' },
    },
  };
});
