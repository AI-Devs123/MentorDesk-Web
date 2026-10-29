import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNexusStream } from '../hooks/useNexusStream';
import { interpretCodeFrame, type ScannedFileEntry } from '../stream/interpreters/codeInterpreter';
import type { StreamFrame } from '../stream/eventTypes';
import type { StreamStatus, UnifiedCodeSymbol } from '../types/code-analysis';
import { SecurityViolationBanner } from './SecurityViolationBanner';

/** 默认沙箱项目名（与后端 /data/nexusmind/sandbox 下的子目录一致） */
const DEFAULT_PROJECT = 'nexusmind-agent-workers';

const STAGE_HINT: Record<string, string> = {
  SCANNING: '正在遍历项目目录，锁定源文件列表…',
  PARSING: '正在逐文件解析 AST…',
  INDEXED: '已接收单文件符号增量，实时渲染拓扑…',
  COMPLETED: '全项目符号提取完成',
  FAILED: '代码分析失败',
  SECURITY_VIOLATION: '安全熔断：越权访问已被拦截',
  AUTH_ERROR: '认证失败',
  ERROR: '编排错误',
};

/** 符号类型配色 */
function kindClass(kind: string): string {
  switch (kind) {
    case 'CLASS':
    case 'INTERFACE':
    case 'ENUM':
    case 'RECORD':
      return 'text-cyan-300 border-cyan-700/60 bg-cyan-900/30';
    case 'METHOD':
    case 'CONSTRUCTOR':
      return 'text-emerald-300 border-emerald-700/60 bg-emerald-900/30';
    case 'FIELD':
      return 'text-amber-300 border-amber-700/60 bg-amber-900/30';
    default:
      return 'text-slate-300 border-slate-700 bg-slate-800/40';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 代码分析沙盒面板（切片5 前端联动）
 *
 * Slice 1 改造：统一经 useNexusStream 传输内核，本面板只保留领域状态机，
 * subscribe 收到原始帧后由 interpretCodeFrame 翻译为状态指令（含符号增量追加与文件滚动）。
 */
export const CodeAnalysisPanel: React.FC = () => {
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT);
  const fileListRef = useRef<HTMLDivElement>(null);

  const { isStreaming, subscribe, startStream, abort, reset: hookReset } = useNexusStream({
    endpoint: '/api/v1/code/analyze/stream',
    cancelEndpoint: '/api/v1/code/analyze/cancel',
  });

  const [status, setStatus] = useState<StreamStatus>('idle');
  const [stage, setStage] = useState('');
  const [taskId, setTaskId] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [processedFiles, setProcessedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [files, setFiles] = useState<ScannedFileEntry[]>([]);
  const [symbols, setSymbols] = useState<UnifiedCodeSymbol[]>([]);
  const [securityMessage, setSecurityMessage] = useState('');
  const [error, setError] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);

  const haltRef = useRef(false);
  const startAtRef = useRef(0);

  // 订阅原始帧 → 领域解释器 → 落到本地状态机
  useEffect(() => {
    const off = subscribe((frame: StreamFrame) => {
      if (haltRef.current) return;
      const r = interpretCodeFrame(frame);
      if (r.freeze) haltRef.current = true;
      if (r.setStatus) setStatus(r.setStatus);
      if (r.setStage) setStage(r.setStage);
      if (r.setTotalFiles !== undefined) setTotalFiles(r.setTotalFiles);
      if (r.setProcessedFiles !== undefined) setProcessedFiles(r.setProcessedFiles);
      if (r.setCurrentFile) setCurrentFile(r.setCurrentFile);
      if (r.addFile) {
        const f = r.addFile;
        setFiles((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].filePath === f.filePath) return prev;
          const next = [...prev, f];
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
      }
      if (r.addSymbols) {
        setSymbols((prev) => {
          const seen = new Set(prev.map((s) => s.symbolId));
          const fresh = r.addSymbols!.filter((s) => s && s.symbolId && !seen.has(s.symbolId));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
      if (r.setSecurityMessage) setSecurityMessage(r.setSecurityMessage);
      if (r.setError) setError(r.setError);
    });
    return off;
  }, [subscribe]);

  const isSecurityHalt = status === 'security_violation';

  // 文件列表自动滚动
  useEffect(() => {
    if (fileListRef.current) {
      fileListRef.current.scrollTop = fileListRef.current.scrollHeight;
    }
  }, [files]);

  // 流式期间实时刷新耗时
  useEffect(() => {
    if (status !== 'streaming') return;
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startAtRef.current);
    }, 200);
    return () => window.clearInterval(timer);
  }, [status]);

  const percent = useMemo(() => {
    if (totalFiles > 0) {
      return Math.min(100, Math.round((processedFiles / totalFiles) * 100));
    }
    return status === 'completed' ? 100 : 0;
  }, [processedFiles, totalFiles, status]);

  const stats = useMemo(() => {
    let types = 0;
    let methods = 0;
    for (const s of symbols) {
      if (['CLASS', 'INTERFACE', 'ENUM', 'RECORD'].includes(s.kind)) types += 1;
      else if (s.kind === 'METHOD' || s.kind === 'CONSTRUCTOR') methods += 1;
    }
    return { types, methods };
  }, [symbols]);

  // 按文件分组（类拓扑）
  const groupedSymbols = useMemo(() => {
    const map = new Map<string, UnifiedCodeSymbol[]>();
    for (const s of symbols) {
      const key = s.filePath || '(unknown)';
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    return Array.from(map.entries());
  }, [symbols]);

  const barColor =
    status === 'security_violation'
      ? 'bg-red-500'
      : status === 'error'
        ? 'bg-amber-500'
        : status === 'completed'
          ? 'bg-emerald-500'
          : 'bg-cyan-500';

  const handleStart = () => {
    const tid = `CODE-${Date.now()}`;
    setTaskId(tid);
    startAtRef.current = Date.now();
    haltRef.current = false;
    setStatus('streaming');
    setStage('');
    setCurrentFile('');
    setProcessedFiles(0);
    setTotalFiles(0);
    setFiles([]);
    setSymbols([]);
    setSecurityMessage('');
    setError('');
    setElapsedMs(0);
    startStream({ projectName: projectName.trim(), taskId: tid, language: 'JAVA' });
  };

  const stop = () => {
    abort();
  };

  const handleReset = () => {
    hookReset();
    haltRef.current = false;
    setStatus('idle');
    setStage('');
    setTaskId('');
    setCurrentFile('');
    setProcessedFiles(0);
    setTotalFiles(0);
    setFiles([]);
    setSymbols([]);
    setSecurityMessage('');
    setError('');
    setElapsedMs(0);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* 头部 */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-bold text-slate-100">代码符号分析沙盒</h2>
        <p className="text-sm text-slate-400 mt-2">
          CodeAgent JavaParser 符号提取 · SSE 实时推流 + RBAC 安全熔断 + 主动中断（Gateway → Supervisor → AgentWorkers）
        </p>
      </div>

      {/* 安全熔断专属告警（优先级最高，置于最上方） */}
      {isSecurityHalt && <SecurityViolationBanner message={securityMessage} />}

      {/* 参数与操作 */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-slate-300 block">
          沙箱项目名（projectName，对应 /data/nexusmind/sandbox 下子目录）:
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          disabled={isStreaming || isSecurityHalt}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 font-mono transition-all disabled:opacity-60"
          placeholder="nexusmind-agent-workers"
        />

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
            disabled={isStreaming || !projectName.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            {isStreaming ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin"></span>
                分析中…
              </>
            ) : (
              <span>开始分析</span>
            )}
          </button>

          <button
            onClick={stop}
            disabled={!isStreaming}
            className="px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors"
          >
            停止分析
          </button>

          <button
            onClick={handleReset}
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
              分析完成 · 耗时 {formatDuration(elapsedMs)}
            </span>
          )}
          {isSecurityHalt && (
            <span className="text-xs text-red-400 font-semibold">
              安全熔断 · 已停止（{formatDuration(elapsedMs)}）
            </span>
          )}

          <span className="ml-auto text-xs text-slate-400 font-mono">
            {processedFiles} / {totalFiles || '—'} 文件
          </span>
        </div>

        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-300`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="text-xs text-slate-400 min-h-5">
          {isSecurityHalt
            ? '已触发安全熔断：CodeAgent 无权访问该目标区域，下游流程已终止。'
            : STAGE_HINT[stage] ?? (status === 'idle' ? '等待开始分析…' : '')}
          {isStreaming && currentFile && (
            <span className="ml-2 font-mono text-cyan-300/80">
              [PARSING] {currentFile}
            </span>
          )}
        </div>
      </div>

      {/* 双栏：文件滚动列表 + 符号拓扑 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 文件扫描滚动列表 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-300">文件扫描列表</h3>
            <span className="text-[11px] text-slate-500">已解析 {files.length}</span>
          </div>
          <div
            ref={fileListRef}
            className="bg-black/60 border border-slate-800 rounded-lg p-3 h-72 overflow-auto font-mono text-xs space-y-0.5"
          >
            {files.length === 0 && (
              <div className="text-slate-600">等待扫描…</div>
            )}
            {files.map((f, idx) => (
              <div
                key={`${f.filePath}-${idx}`}
                className={`whitespace-pre-wrap break-all ${
                  idx === files.length - 1 ? 'text-cyan-300' : 'text-slate-400'
                }`}
              >
                <span className="text-slate-600">[PARSING]</span> {f.filePath}
                <span className="text-slate-600">
                  {' '}
                  ({f.processedFiles}/{f.totalFiles})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 符号拓扑（INDEXED 增量渲染） */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-300">符号拓扑</h3>
            <span className="text-[11px] text-slate-500">
              类型 {stats.types} · 方法 {stats.methods} · 共 {symbols.length}
            </span>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 h-72 overflow-auto space-y-2">
            {groupedSymbols.length === 0 && (
              <div className="text-xs text-slate-600 font-mono">
                等待 INDEXED 符号增量…
              </div>
            )}
            {groupedSymbols.slice(0, 40).map(([filePath, list]) => (
              <div
                key={filePath}
                className="border border-slate-800 rounded-lg overflow-hidden"
              >
                <div className="px-3 py-1.5 bg-slate-900/70 border-b border-slate-800 flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-mono truncate">
                    {filePath}
                  </span>
                  <span className="ml-auto text-[10px] text-slate-500 shrink-0">
                    {list.length} 符号
                  </span>
                </div>
                <ul className="p-2 space-y-1">
                  {list.slice(0, 60).map((s) => {
                    const isChild = !!s.parentId;
                    return (
                      <li
                        key={s.symbolId}
                        className={`flex items-start gap-2 ${isChild ? 'pl-5' : ''}`}
                      >
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-mono shrink-0 ${kindClass(s.kind)}`}
                        >
                          {s.kind}
                        </span>
                        <span className="text-[11px] text-slate-200 font-mono break-all">
                          {s.signature || s.name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {groupedSymbols.length > 40 && (
              <div className="text-[11px] text-slate-500 text-center py-2">
                仅展示前 40 个文件，共 {groupedSymbols.length} 个
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
