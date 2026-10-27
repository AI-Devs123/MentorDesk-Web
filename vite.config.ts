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
      // 注意：SSE 走普通 HTTP 长连接即可，不要设 Connection: upgrade（那是 WebSocket 用的，
      // 给 SSE/普通 POST 加这个头只会干扰代理行为）
      '/api/v1/agent': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // 任务恢复 / 中止在 Gateway(:8080)
      '/api/v1/task': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // 日记审查 / 落盘在 Supervisor(:8081)（JournalReviewController 仅存在于 supervisor）
      '/api/v1/journal': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        secure: false,
      },
      // 认知协同流式（CognitiveReflectDAG）在 Gateway(:8080)
      '/api/v1/cognitive': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // 代码分析流式（/analyze/stream）与主动中断（/analyze/cancel）在 Gateway(:8080)
      '/api/v1/code': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})