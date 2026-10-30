import React, { useState } from 'react';
import { JournalResultCard } from './JournalResultCard';
import type { JournalEntry } from '../types/cognitive';
import { journalAPI } from '../utils/apiClient';

interface ProcessingStats {
  breakthroughCount: number;
  blockerCount: number;
  actionCount: number;
  processingTimeMs: number;
}

/**
 * 日记沙盒验证面板
 *
 * 用途: 为切片 2 提供独立的开发测试环境
 * 职责:
 * - 日记草稿输入与 API 触发
 * - 结构化抽取结果渲染
 * - 物理落盘状态反馈
 * - 详细的错误和校验反馈
 */
export const JournalSandboxPanel: React.FC = () => {
  const [rawText, setRawText] = useState(
    '今天把 Dubbo 3 Triple 协议与前端 WebFlux SSE 转发跑通了。\n' +
      '但是在测试 Abort 取消时，发现前端关闭连接后后端线程还在执行。\n' +
      '排查发现是 WebFlux 的 doOnCancel 没有挂到 Dubbo 上。\n' +
      '明天打通取消信号传播，并补 3 个单元测试。'
  );

  // 状态管理
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [parsedEntry, setParsedEntry] = useState<JournalEntry | null>(null);
  const [savedPath, setSavedPath] = useState<string>('');
  const [stats, setStats] = useState<ProcessingStats | null>(null);

  /**
   * 清空所有状态
   */
  const resetStates = () => {
    setError('');
    setValidationErrors({});
    setParsedEntry(null);
    setSavedPath('');
    setStats(null);
  };

  /**
   * 主流程: 提交日记抽取
   */
  const handleRunJournalReview = async () => {
    resetStates();

    // 基础校验
    if (!rawText.trim()) {
      setValidationErrors({ rawContent: '日记内容不能为空' });
      return;
    }

    if (rawText.length < 10) {
      setValidationErrors({ rawContent: '日记内容过短，至少需要 10 个字符' });
      return;
    }

    setLoading(true);

    try {
      // 调用 API 提交日记
      const response = await journalAPI.submitForReview(rawText);

      if (!response.success) {
        setError(response.message || '日记审查失败');
        if (response.validationErrors) {
          setValidationErrors(response.validationErrors);
        }
        return;
      }

      const data = response.data;
      if (!data) {
        setError(response.message || '服务端未返回数据');
        return;
      }

      const { entry, physicalPath, processingStats } = data;

      // 初始化数据（当前后端为同步返回完整结果，无 SSE 增量通道）
      setParsedEntry(entry);
      setSavedPath(physicalPath);
      if (processingStats) {
        setStats(processingStats);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '网络通信异常');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 清空输入框
   */
  const handleClear = () => {
    setRawText('');
    resetStates();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* 头部 */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-bold text-slate-100">
          JournalAgent 复盘结构化验证
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          切片 2: 日记清洗解析与安全落盘 • Few-Shot 三要素强制抽取 + Append-only 文件保护
        </p>
        {stats && (
          <div className="mt-3 flex gap-4 text-xs text-slate-300">
            <span>
              ✓ 突破点: <span className="font-mono text-emerald-400">{stats.breakthroughCount}</span>
            </span>
            <span>
              ✓ 阻碍: <span className="font-mono text-amber-400">{stats.blockerCount}</span>
            </span>
            <span>
              ✓ 行动: <span className="font-mono text-blue-400">{stats.actionCount}</span>
            </span>
            <span>
              ⏱ 耗时: <span className="font-mono text-slate-500">{stats.processingTimeMs}ms</span>
            </span>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-slate-300 block">
          技术复盘草稿输入 (Markdown 支持):
        </label>
        <textarea
          rows={7}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          disabled={loading}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-slate-200 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 font-mono transition-all disabled:opacity-60"
          placeholder="记录今天的技术感悟、遇到的卡点、根本原因分析、以及明天的规划..."
        />

        {/* 校验错误反馈 */}
        {Object.entries(validationErrors).length > 0 && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-3 space-y-1">
            {Object.entries(validationErrors).map(([field, msg]) => (
              <div key={field} className="text-xs text-red-300">
                <span className="font-semibold">{field}:</span> {msg}
              </div>
            ))}
          </div>
        )}

        {/* 网络错误反馈 */}
        {error && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-3">
            <div className="text-xs text-red-300 font-medium">
              <span className="inline-block mr-2">⚠</span>
              {error}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={handleRunJournalReview}
            disabled={loading || !rawText.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin"></span>
                提交中...
              </>
            ) : (
              <>
                <span>🚀</span>
                提交日记抽取
              </>
            )}
          </button>

          <button
            onClick={handleClear}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-medium text-sm rounded-lg transition-colors"
          >
            清空
          </button>
        </div>
      </div>

      {/* 结构化结果卡片 */}
      {parsedEntry && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">结构化抽取结果:</h3>
          <JournalResultCard
            entry={parsedEntry}
            savedPath={savedPath}
          />
        </div>
      )}

      {/* 调试信息 (开发模式) */}
      {import.meta.env.DEV && parsedEntry && (
        <details className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 cursor-pointer hover:bg-slate-950/70 transition-colors">
          <summary className="text-xs font-semibold text-slate-400 uppercase tracking-wider select-none">
            📋 调试信息 & JSON 预览
          </summary>
          <pre className="mt-3 text-xs text-slate-400 font-mono bg-slate-950 p-3 rounded border border-slate-800 overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(
              {
                entryId: parsedEntry.entryId,
                physicalPath: savedPath,
                extraction: parsedEntry.extraction,
                stats,
              },
              null,
              2
            )}
          </pre>
        </details>
      )}
    </div>
  );
}
