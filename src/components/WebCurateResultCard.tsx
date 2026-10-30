import React, { useState } from 'react';
import {
  calcNoiseReduction,
  formatBytes,
  type StagedPayload,
  type WebCurateResultData,
} from '../types/web-curate';
import { CurateChunkViewer } from './CurateChunkViewer';

interface WebCurateResultCardProps {
  /** COMPLETED 帧携带的完整入库结果 */
  data: WebCurateResultData;

  /** STAGED 先行回执（落盘路径 / 体积），用于在 COMPLETED 之前渐进展示 */
  staged?: StagedPayload | null;
}

/**
 * 网页萃取结果卡片（Week 6 切片5）
 *
 * 设计目标:
 * - 结构化四要素分区: 标题 / 摘要 / 标签+实体徽章 / 落盘状态
 * - 真实指标: 降噪比由 rawHtmlCharCount 与 charCount 联立算出，文件体积取磁盘真实字节数
 * - Chunk 概览: 契约仅回传分块数量（正文留待 Week 7 向量化按需取用），
 *   故此处渲染编号网格而非伪造文本，避免前端展示"看似有内容"的假切片
 */
export const WebCurateResultCard: React.FC<WebCurateResultCardProps> = ({
  data,
  staged,
}) => {
  const { metadata } = data;
  const noise = calcNoiseReduction(data);
  const savedPath = data.sandboxSavedPath || staged?.sandboxSavedPath || '';
  const fileSize = data.fileSizeBytes || staged?.fileSizeBytes || 0;
  const chunkCount = data.chunkCount || staged?.chunkCount || 0;
  // 当前打开查看的切片序号（Slice 5 / 5-D：点击编号取正文）
  const [activeChunk, setActiveChunk] = useState<number | null>(null);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-lg text-slate-100 font-sans space-y-4 my-3 transition-all duration-300">
      {/* 顶部: 元数据头 */}
      <div className="flex flex-wrap items-start justify-between border-b border-slate-800 pb-3 gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              WebCuratorAgent
            </span>
            <span className="text-xs text-slate-400 font-mono">{data.docId}</span>
            {data.renderJsUsed && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-950 text-purple-300 border border-purple-800">
                Playwright 渲染
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-lg font-bold text-slate-100 break-words">
            {metadata?.title || '(无标题)'}
          </h3>
        </div>

        <div className="text-right text-xs text-slate-500 shrink-0 space-y-0.5">
          <div>
            切片总数:{' '}
            <span className="font-semibold text-slate-300">{chunkCount}</span>
          </div>
          <div>文件体积: {formatBytes(fileSize)}</div>
        </div>
      </div>

      {/* 摘要 */}
      {metadata?.summary && (
        <p className="text-sm leading-relaxed text-slate-300 break-words">
          {metadata.summary}
        </p>
      )}

      {/* 标签 + 实体徽章 */}
      {((metadata?.tags?.length ?? 0) > 0 ||
        (metadata?.entities?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {(metadata?.tags ?? []).map((tag, idx) => (
            <span
              key={`tag-${idx}`}
              className="px-2 py-0.5 text-xs rounded-full bg-blue-950/60 text-blue-300 border border-blue-800/60"
            >
              #{tag}
            </span>
          ))}
          {(metadata?.entities ?? []).map((entity, idx) => (
            <span
              key={`entity-${idx}`}
              className="px-2 py-0.5 text-xs rounded-full bg-purple-950/60 text-purple-300 border border-purple-800/60"
            >
              @{entity}
            </span>
          ))}
        </div>
      )}

      {/* 指标条: 原始规模 / 纯净正文 / 降噪比 */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCell label="原始 HTML" value={`${data.rawHtmlCharCount ?? 0} 字`} />
        <MetricCell label="纯净正文" value={`${data.charCount ?? 0} 字`} />
        <MetricCell
          label="降噪比"
          value={`${noise}%`}
          accent="text-emerald-400"
        />
      </div>

      {/* Chunk 概览（契约仅回传数量，故渲染编号网格） */}
      {chunkCount > 0 && (
        <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            语义切片 (Chunks)
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: Math.min(chunkCount, 64) }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveChunk(idx)}
                className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 hover:border-cyan-600 hover:text-cyan-300 hover:bg-cyan-950/40 transition-colors"
                title={`点击查看 Chunk #${idx} 正文`}
              >
                {idx}
              </button>
            ))}
            {chunkCount > 64 && (
              <span className="text-[11px] text-slate-500 self-center ml-1">
                …共 {chunkCount} 片
              </span>
            )}
          </div>
        </div>
      )}

      {/* 沙箱落盘状态（路径直接取后端返回值，与磁盘实际一致） */}
      {savedPath && (
        <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-300 font-semibold">
                沙箱暂存完成 (Ready for RAG)
              </span>
            </div>
            <span className="text-xs text-emerald-400 font-mono bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800 break-all">
              {savedPath}
            </span>
          </div>
        </div>
      )}

      {/* 原始链接（canonical 可能与输入 URL 不同） */}
      {data.canonicalUrl && (
        <div className="text-[11px] text-slate-500 font-mono break-all">
          canonical: {data.canonicalUrl}
        </div>
      )}

      {/* 切片正文查看器（Slice 5 / 5-D：点击上方编号取正文） */}
      {activeChunk !== null && (
        <CurateChunkViewer
          docId={data.docId}
          index={activeChunk}
          totalChunks={chunkCount}
          onClose={() => setActiveChunk(null)}
        />
      )}
    </div>
  );
};

interface MetricCellProps {
  label: string;
  value: string;
  accent?: string;
}

const MetricCell: React.FC<MetricCellProps> = ({
  label,
  value,
  accent = 'text-slate-200',
}) => (
  <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-2.5">
    <div className="text-[10px] text-slate-500 uppercase tracking-wider">
      {label}
    </div>
    <div className={`mt-0.5 text-sm font-semibold font-mono ${accent}`}>
      {value}
    </div>
  </div>
);
