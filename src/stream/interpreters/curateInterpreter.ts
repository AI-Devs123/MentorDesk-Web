/**
 * 网页策展流解释器（Slice 1，纯函数可单测）
 *
 * 把单个 StreamFrame 翻译成对面板状态机的「结构化指令」，面板负责把这些指令落到 React state。
 * 安全熔断采用关键词兜底（与旧 useCurateStream 行为一致）。
 */
import type { StreamFrame } from '../eventTypes';
import { frameStr } from '../eventTypes';
import type {
  CurateStreamStatus,
  StagedPayload,
  StreamLog,
  WebCurateResultData,
} from '../../types/web-curate';

const SECURITY_KEYWORDS = /SecurityGuard|AccessDenied|SSRF|访问控制熔断|越权/i;

export interface CurateInterpretation {
  logEntry?: StreamLog;
  setStatus?: CurateStreamStatus;
  setStaged?: StagedPayload;
  setResult?: WebCurateResultData;
  setSecurityMessage?: string;
  setError?: string;
  freeze?: boolean;
}

function ts(frame: StreamFrame): string {
  const v = frame.timestamp;
  const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  return s ? (s.startsWith('[') ? s : `[${s}]`) : '[--:--:--]';
}

function agent(frame: StreamFrame): string {
  return frameStr(frame, 'agentName') ?? 'Supervisor';
}

function mkLog(frame: StreamFrame, isError = false): StreamLog {
  return {
    timestamp: ts(frame),
    agentName: agent(frame),
    message: frameStr(frame, 'message') ?? frameStr(frame, 'content') ?? '',
    stage: frameStr(frame, 'stage'),
    isError,
  };
}

export function interpretCurateFrame(frame: StreamFrame): CurateInterpretation {
  const stage = frameStr(frame, 'stage') ?? '';
  const content = frameStr(frame, 'content') ?? frameStr(frame, 'message') ?? '';

  // 1) 安全熔断（显式 stage 或 FAILED/ERROR 携带关键词）
  if (
    stage === 'SECURITY_VIOLATION' ||
    ((stage === 'FAILED' || stage === 'ERROR') && SECURITY_KEYWORDS.test(content))
  ) {
    const message = SECURITY_KEYWORDS.test(content)
      ? content
      : '已触发 SecurityGuard 访问控制熔断：当前角色不具备 WEB_INGEST 权限';
    return {
      freeze: true,
      setStatus: 'security_violation',
      setSecurityMessage: message,
      logEntry: mkLog(frame, true),
    };
  }

  // 2) 认证错误
  if (stage === 'AUTH_ERROR') {
    return {
      freeze: true,
      setStatus: 'error',
      setError: content || '认证失败：无效的 JWT Token 或缺少角色信息',
      logEntry: mkLog(frame, true),
    };
  }

  // 3) 失败
  if (stage === 'FAILED' || stage === 'ERROR') {
    return {
      freeze: true,
      setStatus: 'error',
      setError: content || '网页萃取失败',
      logEntry: mkLog(frame, true),
    };
  }

  // 4) 落盘先行回执
  if (stage === 'STAGED') {
    try {
      const parsed = JSON.parse(frameStr(frame, 'payloadJson') ?? '{}') as StagedPayload;
      if (parsed && parsed.sandboxSavedPath) {
        return { setStaged: parsed, logEntry: mkLog(frame) };
      }
    } catch {
      /* 解析失败也至少把过程日志落库 */
    }
    return { logEntry: mkLog(frame) };
  }

  // 5) 完成
  if (stage === 'COMPLETED') {
    try {
      const parsed = JSON.parse(
        frameStr(frame, 'payloadJson') ?? '{}',
      ) as WebCurateResultData;
      return { setResult: parsed, setStatus: 'completed', logEntry: mkLog(frame) };
    } catch {
      return {
        freeze: true,
        setStatus: 'error',
        setError: '结果解析失败：COMPLETED 帧负载不是合法 JSON',
      };
    }
  }

  // 过程帧（SECURITY_CHECK / FETCHING / EXTRACTED 等）
  return { logEntry: mkLog(frame) };
}
