import React, { useState } from 'react';
import type { TutorReflectionPrompt } from '../types/cognitive';
import { StreamingText } from './StreamingText';

interface Props {
  /** 后端 tutor_prompt 数据帧解析出的反思提示 */
  prompt: TutorReflectionPrompt;
}

/** 本地反思暂存前缀（后端反思回传接口未实现前，先本地记录） */
const STORAGE_PREFIX = 'nexusmind_reflection_';

/** 关联线索关系类型配色（contrasts / reinforces / extends） */
const RELATION_COLOR: Record<string, string> = {
  contradicts: 'text-rose-300 border border-rose-700/50 bg-rose-900/30',
  reinforces: 'text-emerald-300 border border-emerald-700/50 bg-emerald-900/30',
  extends: 'text-sky-300 border border-sky-700/50 bg-sky-900/30',
};

/**
 * Tutor 启发式提问交互卡片（切片5）
 *
 * 按后端 TutorReflectionPrompt 真实字段渲染:
 * - targetDomain / coreConflict / contextSummary
 * - questions[]: { index, conceptA, conceptB, questionText } 辨析题
 * - knowledgeLinks[]: { historicalEntryId, relationType, insight }
 *
 * 反思提交：当前后端无 /tutor/reflect 端点，先做本地捕获（localStorage 持久化），
 * 待后端补齐回传接口后再切换为真实提交。
 */
export const TutorReflectBlock: React.FC<Props> = ({ prompt }) => {
  // 切换 prompt 时由调用方以 key={prompt.promptId} 重挂载本组件，从而用最新草稿初始化，
  // 避免在 effect 内同步 setState（react-hooks/set-state-in-effect）
  const [reflection, setReflection] = useState(
    () => localStorage.getItem(STORAGE_PREFIX + prompt.promptId) ?? '',
  );
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!reflection.trim()) return;
    localStorage.setItem(STORAGE_PREFIX + prompt.promptId, reflection.trim());
    setSubmitted(true);
  };

  const { questions, knowledgeLinks } = prompt;

  return (
    <div className="bg-violet-950/20 border border-violet-800/60 rounded-xl p-5 text-slate-100 space-y-4">
      {/* 顶部元信息 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-900/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-violet-950 text-violet-300 border border-violet-800">
            TutorAgent
          </span>
          <span className="text-xs text-slate-400">苏格拉底式启发辨析</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs rounded bg-slate-800 text-violet-300 border border-violet-900">
            {prompt.targetDomain}
          </span>
          <span className="text-xs text-slate-500 font-mono">{prompt.promptId}</span>
        </div>
      </div>

      {/* 核心矛盾 + 背景摘要 */}
      <div className="bg-violet-950/40 border border-violet-900/50 rounded-lg p-3">
        <div className="text-xs font-semibold text-violet-300 uppercase tracking-wider mb-1">
          核心矛盾
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">
          <StreamingText as="text" text={prompt.coreConflict} />
        </p>
        {prompt.contextSummary && (
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            <span className="text-violet-400/80">背景: </span>
            <StreamingText as="text" text={prompt.contextSummary} />
          </p>
        )}
      </div>

      {/* 辨析思考题 */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-violet-300 uppercase tracking-wider">
          辨析思考题
        </div>
        {questions.map((q) => (
          <div key={q.index} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-violet-400 shrink-0">Q{q.index + 1}</span>
              <div className="flex-1 grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
                <div className="bg-slate-900/70 border border-slate-700 rounded p-2">
                  <div className="text-[10px] text-slate-500 mb-0.5">概念 A</div>
                  <div className="font-mono text-violet-300 text-xs break-all">{q.conceptA}</div>
                </div>
                <div className="flex items-center text-slate-500 text-sm">↔</div>
                <div className="bg-slate-900/70 border border-slate-700 rounded p-2">
                  <div className="text-[10px] text-slate-500 mb-0.5">概念 B</div>
                  <div className="font-mono text-violet-300 text-xs break-all">{q.conceptB}</div>
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              <StreamingText as="text" text={q.questionText} />
            </p>
          </div>
        ))}
      </div>

      {/* 关联知识线索 */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-violet-300 uppercase tracking-wider">
          关联知识线索
        </div>
        {knowledgeLinks.length > 0 ? (
          <ul className="space-y-1.5">
            {knowledgeLinks.map((link, idx) => (
              <li
                key={`${link.historicalEntryId}-${idx}`}
                className="bg-slate-950/60 border border-slate-800 rounded p-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`px-1.5 py-0.5 rounded font-mono ${
                      RELATION_COLOR[link.relationType] ??
                      'text-violet-300 border border-violet-900/50 bg-violet-900/40'
                    }`}
                  >
                    {link.relationType}
                  </span>
                  <span className="text-slate-500 font-mono">{link.historicalEntryId}</span>
                </div>
                <p className="text-slate-300 leading-relaxed">{link.insight}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 italic">暂无历史知识关联（首次记录该领域）</p>
        )}
      </div>

      {/* 反思提交 */}
      <div className="border-t border-violet-900/40 pt-3 space-y-2">
        <label className="text-xs font-semibold text-slate-300 block">
          针对设问写下你的反思:
        </label>
        <textarea
          rows={3}
          value={reflection}
          onChange={(e) => {
            setReflection(e.target.value);
            setSubmitted(false);
          }}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
          placeholder="例如：自动发现的便利在于零配置扩展，但隐含了对类路径扫描顺序的耦合…"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            本地记录（回传 TutorAgent 接口待后端补齐）
          </span>
          <div className="flex items-center gap-2">
            {submitted && <span className="text-xs text-emerald-400">✓ 已保存</span>}
            <button
              onClick={handleSubmit}
              disabled={!reflection.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors"
            >
              提交反思
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
