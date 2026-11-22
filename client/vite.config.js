import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0', proxy: { '/socket.io': { target: 'http://127.0.0.1:3001', ws: true }, '/health': 'http://127.0.0.1:3001' } }
});