import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 5173,
    strictPort: true, // 端口被占用时直接报错，避免自动漂移到 5174 导致热更新断连
    watch: {
      usePolling: true, // 开启轮询，彻底解决 Windows 保存不触发热重载的问题
      interval: 100,    // 轮询间隔 100ms
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      }
    }
  }
})