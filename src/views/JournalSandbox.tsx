import React from 'react';
import { JournalSandboxPanel } from '../components/JournalSandboxPanel';

/**
 * 日记沙箱页面
 *
 * 路由: /sandbox/journal
 * 用途: 切片 2 独立验证和开发测试
 *
 * 这是一个完整的页面容器，封装了 JournalSandboxPanel 组件
 * 便于在应用中作为独立路由集成
 */
export const JournalSandbox: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* 顶部导航 (可选) */}
      <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-100">Journal Sandbox</h1>
            <p className="text-xs text-slate-500">Week 4 • Slice 2 Verification</p>
          </div>
          <div className="text-xs text-slate-400">
            <a href="/" className="hover:text-slate-200 transition-colors">
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </nav>

      {/* 主要内容 */}
      <main className="py-6">
        <JournalSandboxPanel />
      </main>
    </div>
  );
};
