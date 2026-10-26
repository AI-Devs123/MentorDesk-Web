import React from 'react';
import { JournalSandboxPanel } from '../components/JournalSandboxPanel';

/**
 * 日记沙盒页面
 *
 * 路由: /sandbox/journal（MainLayout 子路由，导航由侧边栏接管）
 * 用途: 切片 2 独立验证和开发测试
 *
 * 页面容器只负责内容排版；布局（侧边栏/顶部栏）由 MainLayout 统一提供。
 */
export const JournalSandbox: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* 页面标题 */}
      <div className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-bold text-slate-100">Journal Sandbox</h1>
        <p className="text-xs text-slate-500">Week 4 • Slice 2 Verification</p>
      </div>

      {/* 主要内容 */}
      <main className="py-6">
        <JournalSandboxPanel />
      </main>
    </div>
  );
};
