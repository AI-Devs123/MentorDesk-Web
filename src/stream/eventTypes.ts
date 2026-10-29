/**
 * 流式事件通用类型层（Slice 1 统一 SSE 内核）
 *
 * 设计要点：一个 StreamFrame 既可能是「data-only 的 JSON 对象」（agent / curate / code /
 * cognitive 四类旧 hook 的协议），也可能是「带 event: 行的文本」（网关检索流 START /
 * SEARCHING / FUSED / RESULT / COMPLETED）。本类型用索引签名保留任意后端字段，并提供
 * 一组类型安全的取值助手，避免在各处写 as 断言。
 */
import type { SuspendData } from '../types/agent';
export type { SuspendData } from '../types/agent';

export interface StreamFrame {
  /** SSE event: 行（检索流用它承载进度 stage） */
  event?: string;
  /** SSE id: 行（检索流 RESULT 帧携带 requestId） */
  id?: string;
  /** 原始 data 行文本（JSON 解析失败时为纯文本） */
  dataRaw?: string;
  /** 绝大多数流的进度标识 */
  stage?: string;
  /** 普通文本帧内容 */
  content?: string;
  /** 单条日志正文（curate 流另用 message） */
  message?: string;
  timestamp?: string | number;
  agentName?: string;
  /** STAGED / COMPLETED 等结构化帧的 JSON 字符串 */
  payloadJson?: string;
  /** 保留其余任意后端字段（execution_id / token / event / data 等） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** 公共帧解释器（agent 这类「仅产出 logs + suspendInfo」的场景使用）的单条日志 */
export interface FrameLog {
  stage?: string;
  message: string;
}

export interface FrameInterpreterResult {
  logs?: FrameLog[];
  suspend?: SuspendData | null;
  freeze?: boolean;
}

export type FrameInterpreter = (frame: StreamFrame) => FrameInterpreterResult;

/** 取字符串字段（类型安全，避免到处 as） */
export function frameStr(frame: StreamFrame, key: string): string | undefined {
  const v = frame[key];
  return typeof v === 'string' ? v : undefined;
}

/** 取数值字段 */
export function frameNum(frame: StreamFrame, key: string): number | undefined {
  const v = frame[key];
  return typeof v === 'number' ? v : undefined;
}

/** 取数组字段 */
export function frameArr<T = unknown>(frame: StreamFrame, key: string): T[] | undefined {
  const v = frame[key];
  return Array.isArray(v) ? (v as T[]) : undefined;
}
