import React, { useEffect, useState } from 'react';
import { useNexusStream } from '../hooks/useNexusStream';
import {
  interpretCognitiveFrame,
  type CognitiveProgressItem,
} from '../stream/interpreters/cognitiveInterpreter';
import type { StreamFrame } from '../stream/eventTypes';
import { LogViewer } from './LogViewer';
import { JournalResultCard } from './JournalResultCard';
import { TutorReflectBlock } from './TutorReflectBlock';
import type { DataPayload, TutorReflectionPrompt } from '../types/cognitive';

/** 预置示例草稿（含阻碍项，可触发 Tutor 分支） */
const SAMPLE_INPUT =
  '今天把 Dubbo 3 Triple 协议与前端 WebFlux SSE 转发跑通了。\n' +
  '但是在测试 Abort 取消时，发现前端关闭连接后后端线程还在执行。\n' +
  '排查发现是 WebFlux 的 doOnCancel 没有挂到 Dubbo 上。\n' +
  '明天打通取消信号传播，并补 3 个单元测试。';

/**
 * 认知工作流沙盒面板（切片5）
 *
 * Slice 1 改造：统一经 useNexusStream 传输内核，本面板只保留领域状态机，
 * subscribe 收到原始帧后由 interpretCognitiveFrame 翻译为状态指令
 * （journal_result / tutor_prompt / 过程日志 / 终帧 / 认证错误）。
 */
export const CognitiveSandboxPanel: React.FC = () => {
  const [rawText, setRawText] = useState(SAMPLE_INPUT);

  const { isStreaming, subscribe, startStream, abort, reset: hookReset } = useNexusStream({
    endpoint: '/api/v1/cognitive/stream',
  });

  const [progress, setProgress] = useState<CognitiveProgressItem[]>([]);
  const [payload, setPayload] = useState<DataPayload | null>(null);
  const [tutorPrompt, setTutorPrompt] = useState<TutorReflectionPrompt | null>(null);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const off = subscribe((frame: StreamFrame) => {
      const r = interpretCognitiveFrame(frame);
      if (r.addProgress) {
        setProgress((prev) => [...prev, r.addProgress!]);
      }
      if (r.setCompleted) setCompleted(true);
      if (r.setPayload) setPayload(r.setPayload);
      if (r.setTutorPrompt) setTutorPrompt(r.setTutorPrompt);
      if (r.setError) setError(r.setError);
    });
    return off;
  }, [subscribe]);

  const logs = progress.map((p) => {
    const status = p.status ? `[${p.status}]` : '';
    return `[${p.stage}]${status} ${p.content}`;
  });

  const handleRun = () => {
    if (!rawText.trim()) return;
    setProgress([]);
    setPayload(null);
    setTutorPrompt(null);
    setCompleted(false);
    setError('');
    startStream({ rawContent: rawText });
  };

  const handleAbort = () => {
    abort();
  };

  const handleClear = () => {
    hookReset();
    setRawText('');
    setProgress([]);
    setPayload(null);
    setTutorPrompt(null);
    setCompleted(false);
    setError('');
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* 头部 */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-bold text-slate-100">认知工作流沙盒</h2>
        <p className="text-sm text-slate-400 mt-2">
          JournalAgent 三段式复盘 + TutorAgent 苏格拉底辨析 · 全链路 SSE 联调（Gateway → Supervisor → AgentWorkers）
        </p>
      </div>

      {/* 输入区 */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-slate-300 block">
          技术复盘草稿输入 (Markdown 支持):
        </label>
        <textarea
          rows={6}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          disabled={isStreaming}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-slate-200 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 font-mono transition-all disabled:opacity-60"
          placeholder="记录今天的技术进展、卡点与根因、以及明天的计划..."
        />

        {error && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-3">
            <div className="text-xs text-red-300 font-medium">
              <span className="inline-block mr-2">⚠</span>
              {error}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRun}
            disabled={isStreaming || !rawText.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            {isStreaming ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin"></span>
                执行中...
              </>
            ) : (
              <>
                <span>🧩</span>
                运行认知工作流
              </>
            )}
          </button>

          <button
            onClick={handleAbort}
            disabled={!isStreaming}
            className="px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors"
          >
            中止
          </button>

          <button
            onClick={handleClear}
            disabled={isStreaming}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-medium text-sm rounded-lg transition-colors"
          >
            清空
          </button>
        </div>
      </div>

      {/* 执行进度 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-300">执行进度</h3>
          {completed && <span className="text-xs text-emerald-400">✓ 工作流完成</span>}
        </div>
        <LogViewer logs={logs} />
      </div>

      {/* 结构化日记卡片（复用既有 JournalResultCard） */}
      {payload && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-sm font-semibold text-slate-300">结构化日记卡片</h3>
            {payload.processingStats && (
              <div className="flex gap-4 text-xs text-slate-300">
                <span>
                  突破:{' '}
                  <span className="font-mono text-emerald-400">
                    {payload.processingStats.breakthroughCount}
                  </span>
                </span>
                <span>
                  阻碍:{' '}
                  <span className="font-mono text-amber-400">
                    {payload.processingStats.blockerCount}
                  </span>
                </span>
                <span>
                  行动:{' '}
                  <span className="font-mono text-blue-400">
                    {payload.processingStats.actionCount}
                  </span>
                </span>
                <span>
                  耗时:{' '}
                  <span className="font-mono text-slate-500">
                    {payload.processingStats.processingTimeMs}ms
                  </span>
                </span>
              </div>
            )}
          </div>
          <JournalResultCard entry={payload.entry} savedPath={payload.physicalPath} />
        </div>
      )}

      {/* Tutor 启发式提问 */}
      {tutorPrompt && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Tutor 启发式提问</h3>
          <TutorReflectBlock key={tutorPrompt.promptId} prompt={tutorPrompt} />
        </div>
      )}

      {/* Tutor 被跳过时的提示 */}
      {completed && !tutorPrompt && payload && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-400">
          今日日记未提取到技术阻碍，TutorAgent 已跳过苏格拉底辨析引导。
        </div>
      )}
    </div>
  );
};
