import React from 'react';
import type { JournalEntry } from '../types/cognitive';

interface JournalResultCardProps {
  /** 结构化提取后的日记条目 */
  entry: JournalEntry;

  /** 后端返回的 Append-only 物理落盘相对路径（直接展示，不重新拼装） */
  savedPath?: string;
}

/**
 * 日记复盘结构化结果卡片
 *
 * 设计目标:
 * - 三要素分区隔离: 今日突破(绿) / 阻碍分析(黄) / 行动清单(蓝)
 * - 物理落盘状态感知: 显示 Entry ID 和后端返回的 Append-only 路径
 */
export const JournalResultCard: React.FC<JournalResultCardProps> = ({
  entry,
  savedPath,
}) => {
  const { breakthroughs, blockers, mvpActions } = entry.extraction;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-lg text-slate-100 font-sans space-y-4 my-3 transition-all duration-300">
      {/* 顶部: 元数据头 */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center space-x-2">
          {/* Agent 类型徽章 */}
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
            JournalAgent
          </span>

          {/* Entry ID */}
          <span className="text-xs text-slate-400 font-mono">{entry.entryId}</span>

          {/* 记录日期 */}
          <span className="text-xs text-slate-500 font-mono">{entry.recordDate}</span>
        </div>
      </div>

      {/* 物理落盘状态徽章（路径直接取后端返回值，与磁盘实际一致） */}
      {savedPath && (
        <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-xs text-emerald-300 font-semibold">Append-only 落盘完成</span>
            </div>
            <span className="text-xs text-emerald-400 font-mono bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800">
              {savedPath}
            </span>
          </div>
        </div>
      )}

      {/* 标签区 */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* 三要素 1: 今日突破 (绿色) */}
      <BreakthroughSection breakthroughs={breakthroughs} />

      {/* 三要素 2: 阻碍与因果归因 (黄色) */}
      <BlockerSection blockers={blockers} />

      {/* 三要素 3: 次日 MVP 行动清单 (蓝色) */}
      <ActionSection actions={mvpActions} />

      {/* 原始内容预览 (可选) */}
      {entry.rawContent && (
        <details className="bg-slate-950/50 rounded-lg p-3 cursor-pointer hover:bg-slate-950/70 transition-colors">
          <summary className="text-xs font-medium text-slate-400 uppercase tracking-wider select-none">
            原始内容预览
          </summary>
          <div className="mt-2 text-xs text-slate-300 font-mono whitespace-pre-wrap break-words line-clamp-4">
            {entry.rawContent}
          </div>
        </details>
      )}
    </div>
  );
};

/**
 * 今日突破小组件
 */
interface BreakthroughSectionProps {
  breakthroughs: string[];
}

const BreakthroughSection: React.FC<BreakthroughSectionProps> = ({ breakthroughs }) => (
  <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3 hover:bg-emerald-950/30 transition-colors">
    <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
      今日突破 (Breakthroughs)
    </div>
    {breakthroughs.length > 0 ? (
      <ul className="list-disc list-inside text-sm text-slate-200 space-y-1">
        {breakthroughs.map((item, idx) => (
          <li key={idx} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    ) : (
      <div className="text-xs text-slate-500 italic">
        今日未提取到技术突破
      </div>
    )}
  </div>
);

/**
 * 阻碍与因果归因小组件
 */
interface BlockerSectionProps {
  blockers: Array<{ symptom: string; rootCause: string; technicalDomain: string }>;
}

const BlockerSection: React.FC<BlockerSectionProps> = ({ blockers }) => (
  <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-3 hover:bg-amber-950/30 transition-colors">
    <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
      阻碍与因果归因 (Blockers & Root Cause)
    </div>
    {blockers.length > 0 ? (
      <div className="space-y-2">
        {blockers.map((b, idx) => (
          <div
            key={idx}
            className="bg-slate-950/50 rounded p-2.5 text-xs border border-amber-950/30 hover:border-amber-900/50 transition-colors"
          >
            <div className="flex items-start gap-2 mb-1.5">
              <span className="px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 font-mono whitespace-nowrap flex-shrink-0">
                [{b.technicalDomain || 'General'}]
              </span>
              <span className="text-slate-200 font-medium break-words">{b.symptom}</span>
            </div>
            <div className="text-slate-400 pl-2.5 border-l border-slate-800/50">
              <span className="text-amber-500/80 font-medium">根因: </span>
              <span className="break-words">{b.rootCause}</span>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-xs text-slate-500 italic">
        无阻碍记录，执行顺畅
      </div>
    )}
  </div>
);

/**
 * MVP 行动清单小组件
 */
interface ActionSectionProps {
  actions: string[];
}

const ActionSection: React.FC<ActionSectionProps> = ({ actions }) => (
  <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3 hover:bg-blue-950/30 transition-colors">
    <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
      次日 MVP 行动清单 (Next Actions)
    </div>
    {actions.length > 0 ? (
      <ul className="list-disc list-inside text-sm text-slate-200 space-y-1">
        {actions.map((action, idx) => (
          <li key={idx} className="break-words">
            {action}
          </li>
        ))}
      </ul>
    ) : (
      <div className="text-xs text-slate-500 italic">
        暂无明确行动项
      </div>
    )}
  </div>
);
