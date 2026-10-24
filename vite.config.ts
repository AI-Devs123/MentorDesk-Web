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
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 100,
    },
    proxy: {
      // 登录 / 刷新 Token 在 Supervisor(:8081)
      '/api/v1/auth': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        secure: false,
      },
      // SSE 流式执行在 Gateway(:8080)
      '/api/v1/agent': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        // 确保所有请求头都被转发，包括 Authorization
        headers: {
          'Connection': 'upgrade'
        }
      },
      // 任务恢复 / 中止在 Gateway(:8080)
      '/api/v1/task': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})