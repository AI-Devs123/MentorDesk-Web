import { useCallback, useEffect, useRef, useState } from 'react';
import { authStorage } from '../utils/auth';
import type {
  CodeAnalysisFrame,
  StreamStatus,
  UnifiedCodeSymbol,
} from '../types/code-analysis';

/**
 * 安全熔断关键词兜底：
 * 后端首选以 stage=SECURITY_VIOLATION 下发；若某些路径（如 worker 内部 FAILED）
 * 只携带关键词，则此正则兜底识别，避免被误当成普通接口错误。
 */
const SECURITY_KEYWORDS = /SecurityGuard|AccessDenied|访问控制熔断|越权/i;

/** 单个文件解析行 */
export interface ScannedFileEntry {
  filePath: string;
  processedFiles: number;
  totalFiles: number;
}

/**
 * 代码分析流 Hook（切片5 前端联动）
 *
 * 端点: GET /api/v1/code/analyze/stream?projectName=...&taskId=...&language=...
 * 认证: Authorization: Bearer（原生 EventSource 无法附加请求头 → fetch + ReadableStream）
 * 中断: stop() 同时 abort SSE 长连接 + POST /api/v1/code/analyze/cancel 写入取消标志位
 *
 * 状态机：idle → streaming → (completed | security_violation | error)
 */
export function useCodeAnalysisStream() {
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

  const bufferRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const taskIdRef = useRef('');
  const startAtRef = useRef(0);
  /** 熔断后冻结：后续帧全部丢弃，下游动画不再流转 */
  const haltedRef = useRef(false);

  // 流式期间实时刷新耗时
  useEffect(() => {
    if (status !== 'streaming') return;
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startAtRef.current);
    }, 200);
    return () => window.clearInterval(timer);
  }, [status]);

  const reset = useCallback(() => {
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
    bufferRef.current = '';
    haltedRef.current = false;
  }, []);

  /** 处理单帧 */
  const handleFrame = useCallback((frame: CodeAnalysisFrame) => {
    // 已熔断：丢帧，保证下游 DAG 动画立即停止
    if (haltedRef.current) return;

    const frameStage = frame.stage ?? '';
    if (typeof frame.totalFiles === 'number' && frame.totalFiles > 0) {
      setTotalFiles(frame.totalFiles);
    }
    if (typeof frame.processedFiles === 'number' && frame.processedFiles > 0) {
      setProcessedFiles(frame.processedFiles);
    }
    if (frameStage) setStage(frameStage);

    const content = frame.content ?? '';

    // 1) 安全熔断（显式 stage 或 FAILED 携带关键词）
    if (
      frameStage === 'SECURITY_VIOLATION' ||
      ((frameStage === 'FAILED' || frameStage === 'ERROR') &&
        SECURITY_KEYWORDS.test(content))
    ) {
      haltedRef.current = true;
      setStatus('security_violation');
      setSecurityMessage(
        SECURITY_KEYWORDS.test(content)
          ? content
          : '已触发 SecurityGuard 访问控制熔断：CodeAgent 试图越权访问非代码沙箱区域（如日记目录/系统私密数据）',
      );
      setElapsedMs(Date.now() - startAtRef.current);
      return;
    }

    // 2) 认证错误
    if (frameStage === 'AUTH_ERROR') {
      haltedRef.current = true;
      setStatus('error');
      setError(content || '认证失败：无效的 JWT Token 或缺少角色信息');
      return;
    }

    // 3) 失败
    if (frameStage === 'FAILED') {
      haltedRef.current = true;
      setStatus('error');
      setError(content || '代码分析失败');
      return;
    }

    // 4) 完成
    if (frameStage === 'COMPLETED') {
      setStatus('completed');
      setProcessedFiles(frame.totalFiles ?? frame.processedFiles ?? 0);
      setElapsedMs(Date.now() - startAtRef.current);
      return;
    }

    // 5) 逐文件解析（滚动文件列表）
    if (frameStage === 'PARSING') {
      if (frame.currentFile) {
        setCurrentFile(frame.currentFile);
        setFiles((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].filePath === frame.currentFile) {
            return prev;
          }
          const next = [
            ...prev,
            {
              filePath: frame.currentFile!,
              processedFiles: frame.processedFiles ?? 0,
              totalFiles: frame.totalFiles ?? 0,
            },
          ];
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
      }
      return;
    }

    // 6) 符号增量（无需等整个项目扫完即可渲染类/方法节点）
    if (frameStage === 'INDEXED') {
      if (frame.currentFile) setCurrentFile(frame.currentFile);
      const payload = frame.payloadJson;
      if (!payload || payload === '{}' || payload === '[]') return;
      try {
        const parsed: unknown = JSON.parse(payload);
        let list: UnifiedCodeSymbol[] = [];
        if (Array.isArray(parsed)) {
          list = parsed as UnifiedCodeSymbol[];
        } else if (
          parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { symbols?: unknown }).symbols)
        ) {
          list = (parsed as { symbols: UnifiedCodeSymbol[] }).symbols;
        }
        if (list.length === 0) return;
        setSymbols((prev) => {
          const seen = new Set(prev.map((s) => s.symbolId));
          const fresh = list.filter((s) => s && s.symbolId && !seen.has(s.symbolId));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      } catch (e) {
        console.error('[code-analysis] payloadJson 解析失败', e);
      }
      return;
    }

    // SCANNING：仅更新 stage/totalFiles（上方已处理）
  }, []);

  /** SSE 分帧（\n\n 分帧，处理粘包/半包） */
  const processChunk = useCallback(
    (text: string) => {
      bufferRef.current += text;
      const frames = bufferRef.current.split('\n\n');
      bufferRef.current = frames.pop() ?? '';

      for (const frame of frames) {
        const trimmed = frame.trim();
        if (!trimmed.startsWith('data:')) continue;
        const json = trimmed.replace(/^data:\s*/, '').trim();
        if (!json) continue;
        try {
          handleFrame(JSON.parse(json) as CodeAnalysisFrame);
        } catch (e) {
          console.error('[code-analysis] 帧 JSON 解析失败', json, e);
        }
      }
    },
    [handleFrame],
  );

  /**
   * 启动分析
   * @param projectName 沙箱内项目子目录名（后端 projectName → projectSubPath）
   * @param language    语言标记，默认 JAVA（切片2 为 JavaParser 实现）
   */
  const start = useCallback(
    async (projectName: string, language = 'JAVA') => {
      if (!projectName.trim()) {
        setError('项目名不能为空');
        return;
      }

      reset();

      const newTaskId = `CODE-${Date.now()}`;
      taskIdRef.current = newTaskId;
      setTaskId(newTaskId);
      startAtRef.current = Date.now();
      setStatus('streaming');

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = authStorage.getToken();
        if (!token) {
          throw new Error(
            '未登录或登录已过期，请重新登录（需 supervisor / codeAgent 角色）',
          );
        }

        const url =
          `/api/v1/code/analyze/stream?projectName=${encodeURIComponent(projectName)}` +
          `&taskId=${encodeURIComponent(newTaskId)}` +
          `&language=${encodeURIComponent(language)}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        if (!response.body) {
          throw new Error('响应体为空，无法读取流');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          processChunk(decoder.decode(value, { stream: true }));
        }

        // 流自然结束但未收到 COMPLETED 帧时兜底
        setStatus((prev) => (prev === 'streaming' ? 'completed' : prev));
        setElapsedMs(Date.now() - startAtRef.current);
      } catch (err) {
        const e = err as { name?: string; message?: string };
        if (e?.name === 'AbortError') {
          // 用户主动中断：不覆盖安全熔断状态
          setStatus((prev) => (prev === 'security_violation' ? prev : 'idle'));
          setError('已停止分析（用户中断）');
        } else {
          setStatus((prev) => (prev === 'security_violation' ? prev : 'error'));
          setError(e?.message ?? '网络通信异常');
        }
      } finally {
        abortRef.current = null;
      }
    },
    [reset, processChunk],
  );

  /**
   * 主动中断：切断 SSE 长连接 + 向网关发送取消信号（写入取消标志位）
   */
  const stop = useCallback(() => {
    const tid = taskIdRef.current;
    abortRef.current?.abort();
    if (tid) {
      const token = authStorage.getToken();
      void fetch(
        `/api/v1/code/analyze/cancel?taskId=${encodeURIComponent(tid)}`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      ).catch(() => {
        /* 取消信号为 best-effort，失败不影响前端断开 */
      });
    }
  }, []);

  return {
    status,
    stage,
    taskId,
    currentFile,
    processedFiles,
    totalFiles,
    files,
    symbols,
    securityMessage,
    error,
    elapsedMs,
    start,
    stop,
    reset,
  };
}
