/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the demo from a sub-path (e.g. /Orbit/); VITE_BASE carries it.
  base: process.env.VITE_BASE || '/',
  plugins: [vue()],
  server: { host: true, port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
});
