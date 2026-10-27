import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth } from './components/RequireAuth'
import { MainLayout } from './components/MainLayout'
import { LoginPage } from './views/LoginPage'
import { DashboardPage } from './views/DashboardPage'
import { JournalSandbox } from './views/JournalSandbox'
import { CognitiveSandbox } from './views/CognitiveSandbox'
import { CodeAnalysisSandbox } from './views/CodeAnalysisSandbox'

/**
 * 路由表
 *
 * - /login              登录页（无布局，守卫之外）
 * - /                   主布局（RequireAuth 守卫 + 可折叠侧边栏）
 *   - index             执行控制台
 *   - sandbox/journal   日记沙盒
 *   - sandbox/cognitive 认知工作流沙盒
 *
 * 新增业务页面：views/ 加页面组件 + 此处加子路由 + config/navigation.ts 加导航项
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 登录页：无侧边栏全屏路由 */}
          <Route path="/login" element={<LoginPage />} />

          {/* 主布局：登录后所有业务页面 */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <MainLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="sandbox/journal" element={<JournalSandbox />} />
            <Route path="sandbox/cognitive" element={<CognitiveSandbox />} />
            <Route path="sandbox/code-analysis" element={<CodeAnalysisSandbox />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
