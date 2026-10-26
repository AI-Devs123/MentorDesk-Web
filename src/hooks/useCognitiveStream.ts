import { useCallback, useRef, useState } from 'react';
import { authStorage } from '../utils/auth';
import type {
  CognitiveStreamFrame,
  DataPayload,
  TutorReflectionPrompt,
} from '../types/cognitive';

/**
 * 单条过程日志（progress 帧）
 */
export interface CognitiveProgressItem {
  stage: string;
  status?: string;
  content: string;
  timestamp?: number;
}

/**
 * 认知协同流 Hook（Week4 切片4/5）
 *
 * 端点: GET /api/v1/cognitive/stream?rawContent=...（Gateway :8080）
 * 帧协议（CognitiveStreamChunk → 网关 Map）:
 *   - 过程帧: { taskId, timestamp, stage, status, content }
 *   - 数据帧: 额外带 event(journal_result|tutor_prompt) + data(二次编码的 JSON 字符串)
 *   - 终帧:   { stage: "done", content: "WORKFLOW_COMPLETED" }
 *   - 认证:   { stage: "AUTH_ERROR" | "RBAC_SETUP_ERROR", content }
 *
 * 与 useAgentStream 的差异：认知端点要求 Authorization: Bearer，
 * 故同样使用 fetch + ReadableStream（原生 EventSource 无法附加请求头）。
 */
export function useCognitiveStream() {
  const [progress, setProgress] = useState<CognitiveProgressItem[]>([]);
  const [payload, setPayload] = useState<DataPayload | null>(null);
  const [tutorPrompt, setTutorPrompt] = useState<TutorReflectionPrompt | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  const bufferRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  const pushProgress = useCallback((item: CognitiveProgressItem) => {
    setProgress((prev) => [...prev, item]);
  }, []);

  /** 处理单个解析后的帧对象 */
  const handleFrame = useCallback(
    (frame: CognitiveStreamFrame) => {
      const { stage, status, content, event, data, timestamp } = frame;

      // 1. 业务数据帧：data 是二次编码的 DTO JSON 字符串
      if (event && data) {
        try {
          const parsed = JSON.parse(data);
          if (event === 'journal_result') {
            // payload 为 DataPayload { entry, physicalPath, processingStats }
            setPayload(parsed as DataPayload);
          } else if (event === 'tutor_prompt') {
            // payload 为 TutorReflectionPrompt 本体
            setTutorPrompt(parsed as TutorReflectionPrompt);
          }
        } catch (e) {
          console.error('[cognitive] data 帧解析失败', event, data, e);
        }
        return;
      }

      // 2. 终帧
      if (stage === 'done' || content === 'WORKFLOW_COMPLETED') {
        setCompleted(true);
        pushProgress({
          stage: 'done',
          content: content ?? 'WORKFLOW_COMPLETED',
          timestamp,
        });
        return;
      }

      // 3. 认证 / RBAC 错误帧
      if (stage === 'AUTH_ERROR' || stage === 'RBAC_SETUP_ERROR') {
        setError(content ?? '认证失败');
        pushProgress({ stage: stage ?? 'ERROR', content: content ?? '认证失败', timestamp });
        return;
      }

      // 4. 过程日志帧
      if (content) {
        pushProgress({ stage: stage ?? 'Supervisor', status, content, timestamp });
      }
    },
    [pushProgress],
  );

  /** 处理流数据块，维护缓冲区以处理粘包/半包（SSE 以 \n\n 分帧） */
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
          handleFrame(JSON.parse(json) as CognitiveStreamFrame);
        } catch (e) {
          console.error('[cognitive] 帧 JSON 解析失败', json, e);
        }
      }
    },
    [handleFrame],
  );

  const reset = useCallback(() => {
    setProgress([]);
    setPayload(null);
    setTutorPrompt(null);
    setCompleted(false);
    setError('');
    bufferRef.current = '';
  }, []);

  const start = useCallback(
    async (rawContent: string) => {
      if (!rawContent.trim()) {
        setError('内容不能为空');
        return;
      }

      reset();
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = authStorage.getToken();
        if (!token) {
          throw new Error(
            '未登录或登录已过期，请重新登录（需 admin 账号以获得 supervisor 角色）',
          );
        }

        const url = `/api/v1/cognitive/stream?rawContent=${encodeURIComponent(rawContent)}`;
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
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          pushProgress({ stage: 'ABORT', content: '用户中断了连接' });
        } else {
          setError(err?.message ?? '网络通信异常');
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [reset, processChunk, pushProgress],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    progress,
    payload,
    tutorPrompt,
    isStreaming,
    completed,
    error,
    start,
    abort,
    reset,
  };
}
