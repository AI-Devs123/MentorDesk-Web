import React from 'react';
import { CognitiveSandboxPanel } from '../components/CognitiveSandboxPanel';

/**
 * 认知工作流沙盒页面（切片5）
 *
 * 路由: /sandbox/cognitive（MainLayout 子路由，导航由侧边栏接管）
 * 用途: 端到端联调 JournalAgent 三段式复盘 + TutorAgent 苏格拉底辨析
 */
export const CognitiveSandbox: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* 页面标题 */}
      <div className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-bold text-slate-100">Cognitive Workflow Sandbox</h1>
        <p className="text-xs text-slate-500">Week 4 • Slice 5 Full-chain Verification</p>
      </div>

      {/* 主要内容 */}
      <main className="py-6">
        <CognitiveSandboxPanel />
      </main>
    </div>
  );
};
