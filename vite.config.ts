import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Не подхватывать postcss родителя (mesh-chat).
  css: {
    postcss: {
      plugins: [],
    },
  },
  // host:true = с телефона в той же Wi‑Fi.
  // proxy /api → сервер :8787 — телефону нужен только порт 5173 (вход иначе часто не проходит).
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
