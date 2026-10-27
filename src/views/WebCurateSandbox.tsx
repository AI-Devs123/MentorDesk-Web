import React from 'react';
import { WebCuratePanel } from '../components/WebCuratePanel';

/**
 * 网页策展沙盒页面（Week 6 切片5）
 *
 * 路由: /sandbox/web-curate（MainLayout 子路由，导航由侧边栏接管）
 * 用途: 端到端联调 WebCuratorAgent 萃取 SSE 推流 + RBAC 安全熔断 + 主动中断
 */
export const WebCurateSandbox: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950">
      <main className="py-6">
        <WebCuratePanel />
      </main>
    </div>
  );
};
