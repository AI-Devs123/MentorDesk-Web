/**
 * 认知协同流解释器（Slice 1，纯函数可单测）
 *
 * 把单个 StreamFrame 翻译成面板状态指令。认知流分三类帧：
 *  - 数据帧：event(journal_result|tutor_prompt) + data(二次编码的 DTO JSON)
 *  - 终帧：   stage="done" 或 content="WORKFLOW_COMPLETED"
 *  - 过程帧： stage/status/content + 认证/RBAC 错误帧
 */
import type { StreamFrame } from '../eventTypes';
import { frameStr } from '../eventTypes';
import type { DataPayload, TutorReflectionPrompt } from '../../types/cognitive';

export interface CognitiveProgressItem {
  stage: string;
  status?: string;
  content: string;
  timestamp?: number;
}

export interface CognitiveInterpretation {
  addProgress?: CognitiveProgressItem;
  setCompleted?: boolean;
  setPayload?: DataPayload;
  setTutorPrompt?: TutorReflectionPrompt;
  setError?: string;
}

export function interpretCognitiveFrame(frame: StreamFrame): CognitiveInterpretation {
  const stage = frameStr(frame, 'stage') ?? '';
  const status = frameStr(frame, 'status');
  const content = frameStr(frame, 'content') ?? '';
  const event = frameStr(frame, 'event');
  const data = frameStr(frame, 'data');
  const tsRaw = frame.timestamp;
  const ts = typeof tsRaw === 'number' ? tsRaw : undefined;

  // 1) 业务数据帧
  if (event && data) {
    try {
      const parsed: unknown = JSON.parse(data);
      if (event === 'journal_result') return { setPayload: parsed as DataPayload };
      if (event === 'tutor_prompt') return { setTutorPrompt: parsed as TutorReflectionPrompt };
    } catch {
      /* 解析失败忽略 */
    }
    return {};
  }

  // 2) 终帧
  if (stage === 'done' || content === 'WORKFLOW_COMPLETED') {
    return {
      setCompleted: true,
      addProgress: { stage: 'done', content: content || 'WORKFLOW_COMPLETED', timestamp: ts },
    };
  }

  // 3) 认证 / RBAC 错误帧
  if (stage === 'AUTH_ERROR' || stage === 'RBAC_SETUP_ERROR') {
    return {
      setError: content || '认证失败',
      addProgress: { stage: stage || 'ERROR', content: content || '认证失败', timestamp: ts },
    };
  }

  // 4) 过程日志帧
  if (content) {
    return {
      addProgress: { stage: stage || 'Supervisor', status, content, timestamp: ts },
    };
  }

  return {};
}
