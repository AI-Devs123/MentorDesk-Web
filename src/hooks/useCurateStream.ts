import { useCallback, useEffect, useRef, useState } from 'react';
import { authStorage } from '../utils/auth';
import type {
  CurateStreamStatus,
  StagedPayload,
  StreamLog,
  WebCurateFrame,
  WebCurateResultData,
} from '../types/web-curate';

/**
 * 安全熔断关键词兜底：
 * 后端首选以 stage=SECURITY_VIOLATION 下发；若某些路径（如 RPC FAILED 携带 SSRF 文案）
 * 只带关键词，则此正则兜底识别，避免被误当成普通接口错误。
 */
const SECURITY_KEYWORDS = /SecurityGuard|AccessDenied|SSRF|访问控制熔断|越权/i;

/**
 * 网页策展流 Hook（Week 6 切片5 前端联动）
 *
 * 端点: GET /api/v1/curate/stream?url=...&taskId=...&forceRender=...
 * 认证: Authorization: Bearer（原生 EventSource 无法附加请求头 → fetch + ReadableStream）
 * 中断: stop() 同时 abort SSE 长连接 + POST /api/v1/curate/cancel 写入取消标志位
 *
 * 状态机：idle → streaming → (completed | security_violation | error)
 *
 * 与 useCodeAnalysisStream 同构：data-only 分帧（不依赖 event: 行），
 * 粘包/半包用 buffer 续接，熔断后冻结后续帧。
 */
export function useCurateStream() {
  const [status, setStatus] = useState<CurateStreamStatus>('idle');
  const [stage, setStage] = useState('');
  const [taskId, setTaskId] = useState('');
  const [logs, setLogs] = useState<StreamLog[]>([]);
  const [staged, setStaged] = useState<StagedPayload | null>(null);
  const [result, setResult] = useState<WebCurateResultData | null>(null);
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
    setLogs([]);
    setStaged(null);
    setResult(null);
    setSecurityMessage('');
    setError('');
    setElapsedMs(0);
    bufferRef.current = '';
    haltedRef.current = false;
  }, []);

  /** 追加一行控制台日志（时间戳缺失时退化为 stage 标记，保证行首不空） */
  const appendLog = useCallback((frame: WebCurateFrame, isError = false) => {
    const ts =
      typeof frame.timestamp === 'string' && frame.timestamp
        ? frame.timestamp
        : '[--:--:--]';
    setLogs((prev) => {
      const next: StreamLog[] = [
        ...prev,
        {
          timestamp: ts.startsWith('[') ? ts : `[${ts}]`,
          agentName: frame.agentName ?? 'Supervisor',
          message: frame.message ?? frame.content ?? '',
          stage: frame.stage,
          isError,
        },
      ];
      // 控制台最多保留 500 行，避免长任务内存膨胀
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }, []);

  /** 处理单帧 */
  const handleFrame = useCallback(
    (frame: WebCurateFrame) => {
      // 已熔断：丢帧，保证下游状态立即停止
      if (haltedRef.current) return;

      const frameStage = frame.stage ?? '';
      if (frameStage) setStage(frameStage);

      const content = frame.content ?? frame.message ?? '';

      // 1) 安全熔断（显式 stage 或 FAILED/ERROR 携带关键词）
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
            : '已触发 SecurityGuard 访问控制熔断：当前角色不具备 WEB_INGEST 权限',
        );
        appendLog(frame, true);
        setElapsedMs(Date.now() - startAtRef.current);
        return;
      }

      // 2) 认证错误
      if (frameStage === 'AUTH_ERROR') {
        haltedRef.current = true;
        setStatus('error');
        setError(content || '认证失败：无效的 JWT Token 或缺少角色信息');
        appendLog(frame, true);
        return;
      }

      // 3) 失败
      if (frameStage === 'FAILED' || frameStage === 'ERROR') {
        haltedRef.current = true;
        setStatus('error');
        setError(content || '网页萃取失败');
        appendLog(frame, true);
        setElapsedMs(Date.now() - startAtRef.current);
        return;
      }

      // 4) 落盘先行回执（COMPLETED 之前就能展示暂存状态）
      if (frameStage === 'STAGED') {
        try {
          const parsed = JSON.parse(frame.payloadJson ?? '{}') as StagedPayload;
          if (parsed && parsed.sandboxSavedPath) setStaged(parsed);
        } catch (e) {
          console.error('[web-curate] STAGED payloadJson 解析失败', e);
        }
        appendLog(frame);
        return;
      }

      // 5) 完成：解析完整结果供 WebCurateResultCard 渲染
      if (frameStage === 'COMPLETED') {
        try {
          const parsed = JSON.parse(
            frame.payloadJson ?? '{}',
          ) as WebCurateResultData;
          setResult(parsed);
          appendLog(frame);
          setStatus('completed');
          setElapsedMs(Date.now() - startAtRef.current);
          return;
        } catch (e) {
          console.error('[web-curate] COMPLETED payloadJson 解析失败', e);
          haltedRef.current = true;
          setStatus('error');
          setError('结果解析失败：COMPLETED 帧负载不是合法 JSON');
          return;
        }
      }

      // SECURITY_CHECK / FETCHING / EXTRACTED 等过程帧：滚动进控制台
      appendLog(frame);
    },
    [appendLog],
  );

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
          handleFrame(JSON.parse(json) as WebCurateFrame);
        } catch (e) {
          console.error('[web-curate] 帧 JSON 解析失败', json, e);
        }
      }
    },
    [handleFrame],
  );

  /**
   * 启动网页萃取
   * @param url         目标网页 URL（后端 SSRF 校验，仅允许公网地址）
   * @param forceRender 是否强制无头浏览器渲染通道
   */
  const start = useCallback(
    async (url: string, forceRender = false) => {
      const target = url.trim();
      if (!target) {
        setError('目标 URL 不能为空');
        return;
      }
      if (!/^https?:\/\//i.test(target)) {
        setError('仅支持 http / https 协议的目标地址');
        return;
      }

      reset();

      const newTaskId = `WEB-${Date.now()}`;
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
            '未登录或登录已过期，请重新登录（需 supervisor / webCurator 角色）',
          );
        }

        const endpoint =
          `/api/v1/curate/stream?url=${encodeURIComponent(target)}` +
          `&taskId=${encodeURIComponent(newTaskId)}` +
          `&forceRender=${forceRender}`;

        const response = await fetch(endpoint, {
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
          setError('已停止萃取（用户中断）');
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
      void fetch(`/api/v1/curate/cancel?taskId=${encodeURIComponent(tid)}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {
        /* 取消信号为 best-effort，失败不影响前端断开 */
      });
    }
  }, []);

  return {
    status,
    stage,
    taskId,
    logs,
    staged,
    result,
    securityMessage,
    error,
    elapsedMs,
    start,
    stop,
    reset,
  };
}
