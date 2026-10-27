import React from 'react';
import { CodeAnalysisPanel } from '../components/CodeAnalysisPanel';

/**
 * 代码分析沙盒页面（Week5 切片5）
 *
 * 路由: /sandbox/code-analysis（MainLayout 子路由，导航由侧边栏接管）
 * 用途: 端到端联调 CodeAgent 符号提取 SSE 推流 + RBAC 安全熔断 + 主动中断
 */
export const CodeAnalysisSandbox: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* 页面标题 */}
      <div className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-bold text-slate-100">Code Analysis Sandbox</h1>
        <p className="text-xs text-slate-500">
          Week 5 • Slice 5 Streaming &amp; Security Circuit Breaker
        </p>
      </div>

      {/* 主要内容 */}
      <main className="py-6">
        <CodeAnalysisPanel />
      </main>
    </div>
  );
};
