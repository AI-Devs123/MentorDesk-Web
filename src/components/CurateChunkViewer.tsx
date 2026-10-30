import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ragAPI, type RagChunkPayload } from '../utils/apiClient';
import { MarkdownStream } from './MarkdownStream';

interface Props {
  /** 文档 ID（后端切片索引键） */
  docId: string;
  /** 切片序号（从 0 起） */
  index: number;
  /** 该文档切片总数（用于角标展示） */
  totalChunks: number;
  /** 关闭查看器 */
  onClose: () => void;
}

/**
 * 语义切片正文查看器（Slice 5 / 5-D）
 *
 * 点击 WebCurate 结果卡片上的切片编号后，按需经 ragAPI.getChunk 取回该切片正文，
 * 沿用 Slice 3 的 MarkdownStream 渐进渲染（与后端 SecurityGuard 同样不解析原始 HTML）。
 *
 * 后端端点 GET /api/v1/rag/chunk 当前尚未实现（原 Week 7 部分）；本组件在请求失败时
 * 会明确提示「后端尚未提供取数端点」，而非伪造内容——前端就绪、后端闸门清晰。
 *
 * 复用自 SandboxMarkdownViewer 的 reqId 竞态防护：切换切片时丢弃过期响应。
 */
export const CurateChunkViewer: React.FC<Props> = ({ docId, index, totalChunks, onClose }) => {
  const [payload, setPayload] = useState<RagChunkPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError('');
    setPayload(null);
    try {
      const data = await ragAPI.getChunk(docId, index);
      if (myReq !== reqId.current) return; // 已切换到其它切片，丢弃过期响应
      setPayload(data);
    } catch (e) {
      if (myReq !== reqId.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [docId, index]);

  useEffect(() => {
    const id = ++reqId.current;
    // 微任务延迟：避免在 effect 体内同步 setState（react-hooks/set-state-in-effect）
    void Promise.resolve().then(() => {
      if (id !== reqId.current) return;
      void load();
    });
  }, [load]);

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[82vh] flex flex-col rounded-xl border border-rose-900 bg-[#121214] text-zinc-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
              Chunk #{index}
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              {totalChunks > 0 ? `${index} / ${totalChunks - 1}` : index} · docId: {docId}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-sm px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
          >
            ✕ 关闭
          </button>
        </div>

        {/* 正文区 */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="inline-block w-4 h-4 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
              正在取回切片正文…
            </div>
          )}

          {error && (
            <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 text-sm text-amber-200">
              <div className="font-semibold mb-1">取数失败</div>
              <div className="text-amber-300/90 leading-relaxed">
                后端尚未提供切片取数端点 <code className="font-mono">GET /api/v1/rag/chunk</code>
                （原 Week 7 部分），或请求被拒绝。原始错误：{error}
              </div>
            </div>
          )}

          {payload && (
            <>
              {payload.truncated && (
                <div className="mb-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded px-3 py-1.5">
                  该切片超过上限，已截断展示。
                </div>
              )}
              <MarkdownStream
                text={payload.content}
                typing={payload.content.length <= 3000}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
