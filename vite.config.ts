import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// 动态 base：GitHub Pages 部署到子路径时自动适配，本地开发用 '/'
// 环境变量 BASE_PATH 由 CI 设置，如 '/node-orbit/'
const base = process.env.BASE_PATH || '/';

// Single source of truth for the app version — injected at build time so the
// UI and package.json never drift apart.
const APP_VERSION = pkg.version;

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
