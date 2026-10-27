import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCurateStream } from '../hooks/useCurateStream';
import { SecurityViolationBanner } from './SecurityViolationBanner';
import { WebCurateResultCard } from './WebCurateResultCard';
import { formatBytes } from '../types/web-curate';

/** 阶段推进顺序（用于进度条百分比） */
const STAGE_ORDER = [
  'SECURITY_CHECK',
  'FETCHING',
  'EXTRACTED',
  'STAGED',
  'COMPLETED',
];

const STAGE_HINT: Record<string, string> = {
  SECURITY_CHECK: '正在校验目标协议与内网边界（SSRF 防御规则已生效）…',
  FETCHING: '双引擎抓取中：FastHttp 优先，SPA 空壳自动降级无头浏览器…',
  EXTRACTED: '正文提纯完成，正在由统一 LLM 进行元数据萃取与语义切片…',
  STAGED: 'Markdown 资产正在安全落盘至沙箱暂存区…',
  COMPLETED: '知识萃取与资产暂存完成',
  FAILED: '网页萃取失败',
  SECURITY_VIOLATION: '安全熔断：目标被安全层拦截',
  AUTH_ERROR: '认证失败',
  ERROR: '编排错误',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 网页策展沙盒面板（Week 6 切片5）
 *
 * 三项职责：
 * 1. 消费 /api/v1/curate/stream 专用 SSE，按 stage 驱动 UI 状态机
 *    （SECURITY_CHECK → FETCHING → EXTRACTED → STAGED → COMPLETED）
 * 2. 安全熔断专属红色告警（SECURITY_VIOLATION / 关键词兜底），不降级为普通错误
 * 3. AbortController 主动中断：切断 SSE + POST 取消信号
 */
export const WebCuratePanel: React.FC = () => {
  const [url, setUrl] = useState('');
  const [forceRender, setForceRender] = useState(false);
  const logListRef = useRef<HTMLDivElement>(null);

  const {
    status,
    stage,
    taskId,
    logs,
    staged,
    result,
    securityMessage,
    error,
    elapsedMs,
    start,
    stop,
    reset,
  } = useCurateStream();

  const isStreaming = status === 'streaming';
  const isSecurityHalt = status === 'security_violation';

  // 控制台自动滚动到底部
  useEffect(() => {
    if (logListRef.current) {
      logListRef.current.scrollTop = logListRef.current.scrollHeight;
    }
  }, [logs]);

  const percent = useMemo(() => {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx >= 0) {
      return Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
    }
    return status === 'completed' ? 100 : 0;
  }, [stage, status]);

  const barColor =
    status === 'security_violation'
      ? 'bg-red-500'
      : status === 'error'
        ? 'bg-amber-500'
        : status === 'completed'
          ? 'bg-emerald-500'
          : 'bg-cyan-500';

  const handleStart = () => {
    void start(url, forceRender);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* 头部 */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-bold text-slate-100">网页知识萃取沙盒</h2>
        <p className="text-sm text-slate-400 mt-2">
          WebCuratorAgent 抓取 → 提纯 → LLM 萃取 → 语义分块 → 沙箱落盘 · SSE 实时推流 +
          RBAC 安全熔断 + 主动中断（Gateway → Supervisor → AgentWorkers）
        </p>
      </div>

      {/* 安全熔断专属告警（优先级最高，置于最上方） */}
      {isSecurityHalt && <SecurityViolationBanner message={securityMessage} />}

      {/* 参数与操作 */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-slate-300 block">
          目标网页 URL（仅公网 http/https，内网与回环地址将被 SSRF 规则拒绝）:
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isStreaming || isSecurityHalt}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 font-mono transition-all disabled:opacity-60"
          placeholder="https://example.com/article/42"
        />

        <label className="flex items-center gap-2 text-xs text-slate-400 select-none">
          <input
            type="checkbox"
            checked={forceRender}
            onChange={(e) => setForceRender(e.target.checked)}
            disabled={isStreaming || isSecurityHalt}
            className="w-3.5 h-3.5 accent-cyan-500"
          />
          强制无头浏览器渲染（应对 SPA / 反爬登录墙，耗时更长）
        </label>

        {error && !isSecurityHalt && (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3">
            <div className="text-xs text-amber-300 font-medium">
              <span className="inline-block mr-2">!</span>
              {error}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleStart}
            disabled={isStreaming || !url.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            {isStreaming ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
                萃取中…
              </>
            ) : (
              <span>开始萃取</span>
            )}
          </button>

          <button
            onClick={stop}
            disabled={!isStreaming}
            className="px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors"
          >
            停止
          </button>

          <button
            onClick={reset}
            disabled={isStreaming}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-medium text-sm rounded-lg transition-colors"
          >
            清空
          </button>

          <span className="ml-auto text-[11px] text-slate-500 font-mono">
            {taskId ? `taskId: ${taskId}` : 'taskId: —'}
          </span>
        </div>
      </div>

      {/* 状态机 + 进度条 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-300">执行进度</h3>

          {stage && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded border font-mono ${
                isSecurityHalt
                  ? 'text-red-300 border-red-700 bg-red-900/30'
                  : stage === 'COMPLETED'
                    ? 'text-emerald-300 border-emerald-700 bg-emerald-900/30'
                    : 'text-cyan-300 border-cyan-700 bg-cyan-900/30'
              }`}
            >
              {stage}
            </span>
          )}

          {status === 'completed' && (
            <span className="text-xs text-emerald-400">
              萃取完成 · 耗时 {formatDuration(elapsedMs)}
            </span>
          )}
          {isSecurityHalt && (
            <span className="text-xs text-red-400 font-semibold">
              安全熔断 · 已停止（{formatDuration(elapsedMs)}）
            </span>
          )}
        </div>

        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-300`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="text-xs text-slate-400 min-h-5">
          {isSecurityHalt
            ? '已触发安全熔断：目标未通过 SSRF / RBAC 校验，下游流程已终止。'
            : (STAGE_HINT[stage] ?? (status === 'idle' ? '等待提交目标 URL…' : ''))}
        </div>

        {/* STAGED 先行回执：COMPLETED 之前即可看到落盘位置 */}
        {staged && !result && (
          <div className="text-xs text-emerald-400/90 font-mono break-all">
            已落盘: {staged.sandboxSavedPath}（{formatBytes(staged.fileSizeBytes)}，
            {staged.chunkCount} 片）
          </div>
        )}
      </div>

      {/* 实时控制台 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-300">阶段控制台</h3>
          <span className="text-[11px] text-slate-500">{logs.length} 行</span>
        </div>
        <div
          ref={logListRef}
          className="bg-black/60 border border-slate-800 rounded-lg p-3 h-64 overflow-auto font-mono text-xs space-y-0.5"
        >
          {logs.length === 0 && (
            <div className="text-slate-600">等待推流…</div>
          )}
          {logs.map((log, idx) => (
            <div
              key={idx}
              className={`whitespace-pre-wrap break-all ${
                log.isError
                  ? 'text-red-300'
                  : idx === logs.length - 1
                    ? 'text-cyan-300'
                    : 'text-slate-400'
              }`}
            >
              <span className="text-slate-600">{log.timestamp}</span>{' '}
              <span className="text-slate-500">{log.agentName}</span>{' '}
              <span className="text-slate-600">→</span> {log.message}
            </div>
          ))}
        </div>
      </div>

      {/* 结果卡片 */}
      {result && <WebCurateResultCard data={result} staged={staged} />}
    </div>
  );
};
