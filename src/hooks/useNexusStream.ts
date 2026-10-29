/**
 * 统一流式 Hook（Slice 1 单一入口）
 *
 * 设计：传输 + 分帧 + abort + token 全部收敛到 NexusStreamClient；
 * 领域状态机逻辑两种出口并存：
 *  - 公共 interpreter（如 agent）：自动产出 hook 级 logs / suspendInfo；
 *  - subscribe(frame)：把原始帧广播给面板，面板各自跑领域解释器（curate/code/cognitive）。
 *
 * 统一语义：
 *  - 所有端点经同一套 fetch + Bearer + 可选 X-Agent-Context；
 *  - abort() 切断长连接；若配置了 cancelEndpoint（curate/code），同时 POST 取消信号（best-effort）；
 *  - 统一 401/403/AbortError 错误日志（替换 4 个旧 hook 各自的分支）。
 */
import { useCallback, useRef, useState } from 'react';
import { authStorage } from '../utils/auth';
import { openStream } from '../stream/NexusStreamClient';
import type { FrameInterpreter, StreamFrame, SuspendData } from '../stream/eventTypes';

export interface UseNexusStreamConfig {
  endpoint: string;
  method?: 'GET' | 'POST';
  defaultQuery?: Record<string, string | number | boolean>;
  agentContext?: string;
  /** 破坏性取消接口：abort() 时自动 POST 取消信号（curate/code 用） */
  cancelEndpoint?: string;
  /** 公共帧解释器：仅用于把帧转成 hook 级 logs / suspendInfo（如 agent） */
  interpreter?: FrameInterpreter;
}

export interface UseNexusStreamApi {
  logs: string[];
  isStreaming: boolean;
  suspendInfo: SuspendData | null;
  setSuspendInfo: (v: SuspendData | null) => void;
  subscribe: (handler: (frame: StreamFrame) => void) => () => void;
  startStream: (
    query?: Record<string, string | number | boolean>,
    body?: unknown,
  ) => void;
  abort: () => void;
  reset: () => void;
}

export function useNexusStream(config: UseNexusStreamConfig): UseNexusStreamApi {
  const { endpoint, method = 'GET', defaultQuery = {}, agentContext, cancelEndpoint, interpreter } =
    config;

  const [logs, setLogs] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [suspendInfo, setSuspendInfo] = useState<SuspendData | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const subscribersRef = useRef<Set<(f: StreamFrame) => void>>(new Set());
  const frozenRef = useRef(false);
  const lastTaskIdRef = useRef<string>('');

  const pushLog = useCallback((stage: string | undefined, message: string) => {
    const t = new Date().toLocaleTimeString();
    const prefix = stage ? `[${t}] [${stage}]` : `[${t}]`;
    setLogs((prev) => [...prev, `${prefix} ${message}`]);
  }, []);

  const subscribe = useCallback((handler: (f: StreamFrame) => void) => {
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    if (cancelEndpoint && lastTaskIdRef.current) {
      const token = authStorage.getToken();
      void fetch(`${cancelEndpoint}?taskId=${encodeURIComponent(lastTaskIdRef.current)}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {
        /* 取消信号为 best-effort，失败不影响前端断开 */
      });
    }
  }, [cancelEndpoint]);

  const reset = useCallback(() => {
    setLogs([]);
    setSuspendInfo(null);
    setIsStreaming(false);
    frozenRef.current = false;
  }, []);

  const startStream = useCallback(
    async (
      query: Record<string, string | number | boolean> = {},
      body?: unknown,
    ) => {
      const merged = { ...defaultQuery, ...query };
      lastTaskIdRef.current = String(merged.taskId ?? '');
      reset();
      setIsStreaming(true);

      const token = authStorage.getToken();
      if (!token) {
        pushLog('ERROR', '未登录或登录已过期，请重新登录');
        setIsStreaming(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await openStream(
          {
            url: endpoint,
            method,
            token,
            query: merged,
            body,
            agentContext,
            signal: controller.signal,
          },
          {
            onFrame: (frame) => {
              if (frozenRef.current) return;
              if (interpreter) {
                const r = interpreter(frame);
                if (r.freeze) frozenRef.current = true;
                if (r.suspend !== undefined) setSuspendInfo(r.suspend);
                if (r.logs) for (const l of r.logs) pushLog(l.stage, l.message);
              }
              subscribersRef.current.forEach((h) => h(frame));
            },
            onError: (err) => {
              if (err.name === 'AbortError') {
                pushLog('ABORT', '用户中断了连接');
              } else {
                pushLog('ERROR', err.message ?? '网络通信异常');
              }
            },
            onDone: () => {
              if (interpreter) pushLog('COMPLETED', '流推送完成');
            },
          },
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [endpoint, method, defaultQuery, agentContext, interpreter, pushLog, reset],
  );

  return {
    logs,
    isStreaming,
    suspendInfo,
    setSuspendInfo,
    subscribe,
    startStream,
    abort,
    reset,
  };
}
