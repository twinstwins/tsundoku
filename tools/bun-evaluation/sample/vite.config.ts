import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/bun-evaluation/',
  server: { host: '127.0.0.1', port: 45173, strictPort: true },
  build: { manifest: true, rollupOptions: { input: 'src/main.tsx' } },
});
