/**
 * 代码分析流解释器（Slice 1，纯函数可单测）
 *
 * 把单个 StreamFrame 翻译成对面板状态机的结构化指令。符号增量（INDEXED）与文件滚动（PARSING）
 * 以「追加」语义返回，由面板拼接到既有数组。安全熔断关键词兜底（与旧 useCodeAnalysisStream 一致）。
 */
import type { StreamFrame } from '../eventTypes';
import { frameStr, frameNum } from '../eventTypes';
import type { StreamStatus, UnifiedCodeSymbol } from '../../types/code-analysis';
import type { SuspendData } from '../../types/agent';
import { SUSPEND_STAGES } from './agentInterpreter';

const SECURITY_KEYWORDS = /SecurityGuard|AccessDenied|访问控制熔断|越权/i;

export interface ScannedFileEntry {
  filePath: string;
  processedFiles: number;
  totalFiles: number;
}

export interface CodeInterpretation {
  setStatus?: StreamStatus;
  setStage?: string;
  setTotalFiles?: number;
  setProcessedFiles?: number;
  setCurrentFile?: string;
  addFile?: ScannedFileEntry;
  addSymbols?: UnifiedCodeSymbol[];
  setSecurityMessage?: string;
  setError?: string;
  freeze?: boolean;
  /** 破坏性操作挂起（SUSPEND 帧）→ 交给面板渲染确认弹窗 */
  suspend?: SuspendData;
}

export function interpretCodeFrame(frame: StreamFrame): CodeInterpretation {
  const stage = frameStr(frame, 'stage') ?? '';
  const content = frameStr(frame, 'content') ?? '';
  const taskId = frameStr(frame, 'taskId') ?? '';
  const result: CodeInterpretation = {};

  // 0) 破坏性操作挂起（与 agentInterpreter 同构，复用 SUSPEND_STAGES）
  // 注：当前后端 CodeAnalysisStreamController 为阻塞式整批返回，并不下发 SUSPEND 帧；
  // 此处接线是面向未来的「就绪态」——一旦后端 code 链路补发 SUSPEND，面板即可直接弹确认框。
  if (SUSPEND_STAGES.includes(stage)) {
    const suspend: SuspendData = {
      execution_id: frameStr(frame, 'execution_id') ?? taskId ?? '',
      token: frameStr(frame, 'token') ?? '',
      promptHash: frameStr(frame, 'promptHash') ?? '',
      operation_type: frameStr(frame, 'operation_type') ?? 'UNKNOWN',
      risk_level: (frame.risk_level as SuspendData['risk_level']) ?? 'MEDIUM',
      description: frameStr(frame, 'description') ?? content ?? '破坏性操作',
      affected_files: (frame.affected_files as string[] | undefined) ?? [],
      change_preview: frameStr(frame, 'change_preview') ?? undefined,
      expires_at:
        frameStr(frame, 'expires_at') ??
        new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    };
    return { freeze: true, suspend };
  }

  // 1) 安全熔断
  if (
    stage === 'SECURITY_VIOLATION' ||
    ((stage === 'FAILED' || stage === 'ERROR') && SECURITY_KEYWORDS.test(content))
  ) {
    const message = SECURITY_KEYWORDS.test(content)
      ? content
      : '已触发 SecurityGuard 访问控制熔断：CodeAgent 试图越权访问非代码沙箱区域（如日记目录/系统私密数据）';
    return { freeze: true, setStatus: 'security_violation', setSecurityMessage: message };
  }

  // 2) 认证
  if (stage === 'AUTH_ERROR') {
    return {
      freeze: true,
      setStatus: 'error',
      setError: content || '认证失败：无效的 JWT Token 或缺少角色信息',
    };
  }

  // 3) 失败
  if (stage === 'FAILED') {
    return { freeze: true, setStatus: 'error', setError: content || '代码分析失败' };
  }

  // 4) 完成
  if (stage === 'COMPLETED') {
    return {
      setStatus: 'completed',
      setProcessedFiles: frameNum(frame, 'totalFiles') ?? frameNum(frame, 'processedFiles') ?? 0,
    };
  }

  // 5) 逐文件解析（PARSING）
  if (stage === 'PARSING') {
    const cf = frameStr(frame, 'currentFile');
    const tf = frameNum(frame, 'totalFiles');
    const pf = frameNum(frame, 'processedFiles');
    result.setStage = 'PARSING';
    if (tf !== undefined) result.setTotalFiles = tf;
    if (pf !== undefined) result.setProcessedFiles = pf;
    if (cf) result.addFile = { filePath: cf, processedFiles: pf ?? 0, totalFiles: tf ?? 0 };
    return result;
  }

  // 6) 符号增量（INDEXED）
  if (stage === 'INDEXED') {
    const cf = frameStr(frame, 'currentFile');
    const pf = frameNum(frame, 'processedFiles');
    const tf = frameNum(frame, 'totalFiles');
    result.setStage = 'INDEXED';
    if (cf) result.setCurrentFile = cf;
    if (tf !== undefined) result.setTotalFiles = tf;
    if (pf !== undefined) result.setProcessedFiles = pf;
    const payload = frameStr(frame, 'payloadJson') ?? '{}';
    if (payload && payload !== '{}' && payload !== '[]') {
      try {
        const parsed: unknown = JSON.parse(payload);
        let list: UnifiedCodeSymbol[] = [];
        if (Array.isArray(parsed)) {
          list = parsed as UnifiedCodeSymbol[];
        } else if (parsed && typeof parsed === 'object') {
          const obj = parsed as { symbols?: unknown };
          if (Array.isArray(obj.symbols)) {
            list = obj.symbols as UnifiedCodeSymbol[];
          }
        }
        if (list.length > 0) result.addSymbols = list;
      } catch {
        /* 解析失败忽略 */
      }
    }
    return result;
  }

  // 7) SCANNING / 其它过程帧
  if (stage) result.setStage = stage;
  const tf = frameNum(frame, 'totalFiles');
  if (tf !== undefined) result.setTotalFiles = tf;
  return result;
}
