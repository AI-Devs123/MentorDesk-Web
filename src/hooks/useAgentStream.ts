import { useState, useCallback, useRef } from 'react';
import type { SuspendData, StreamEventChunk } from '../types/agent';

/**
 * 流式 Agent Hook
 * 职责：
 * 1. 读取 SSE 流 → 解析 JSON 帧 → 识别 SUSPEND_FOR_CONFIRMATION 事件
 * 2. 从 localStorage 读取 JWT Token
 * 3. 在请求头中添加 Authorization: Bearer <token>
 */
export function useAgentStream() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [suspendInfo, setSuspendInfo] = useState<SuspendData | null>(null);
  const bufferRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 添加日志（带时间戳）
   */
  const addLog = useCallback((message: string, stage?: string) => {
    const timeStr = new Date().toLocaleTimeString();
    const prefix = stage ? `[${timeStr}] [${stage}]` : `[${timeStr}]`;
    setLogs(prev => [...prev, `${prefix} ${message}`]);
  }, []);

  /**
   * 处理单条 SSE 数据帧
   * 格式: data: {...JSON...}
   */
  const processFrame = useCallback(
    (line: string) => {
      const trimmedLine = line.trim();

      // 跳过空行和非 data: 行
      if (!trimmedLine || !trimmedLine.startsWith('data:')) {
        return;
      }

      const rawJson = trimmedLine.replace(/^data:\s*/, '').trim();
      if (!rawJson) {
        return;
      }

      try {
        const chunk: StreamEventChunk = JSON.parse(rawJson);
        const { stage, content, taskId } = chunk;

        if (stage === 'SUSPEND_FOR_CONFIRMATION' || 
            stage === 'LAYERS_CONFIRMATION_REQUIRED' || 
            stage === 'LAYER3_CONFIRMATION_REQUIRED') {
          try {
            const payload: SuspendData = {
              execution_id: chunk.execution_id || taskId,
              token: chunk.token || '',
              operation_type: chunk.operation_type || 'UNKNOWN',
              risk_level: (chunk.risk_level as any) || 'MEDIUM',
              description: chunk.description || content || '破坏性操作',
              affected_files: chunk.affected_files || [],
              expires_at: chunk.expires_at || new Date(Date.now() + 3 * 60 * 1000).toISOString(),
            };
            
            setSuspendInfo(payload);
            addLog(
              `⚠️ 拦截到破坏性操作 | 任务ID: ${payload.execution_id} | Token: ${payload.token}`,
              stage
            );
          } catch (e) {
            addLog(`[WARN] 挂起事件解析失败: ${e}`, stage);
          }
          return;
        }

        addLog(content, stage);
      } catch (e) {
        console.error('[SSE Parse Error]', rawJson, e);
      }
    },
    [addLog]
  );

  /**
   * 处理流数据块
   * 维护缓冲区处理粘包/半包
   */
  const processChunk = useCallback(
    (data: string) => {
      bufferRef.current += data;

      // SSE 规范：\n\n 分割帧
      const frames = bufferRef.current.split('\n\n');
      // 保留最后一个不完整的帧
      bufferRef.current = frames.pop() || '';

      // 处理已完整的帧
      for (const frame of frames) {
        if (frame.trim()) {
          processFrame(frame);
        }
      }
    },
    [processFrame]
  );

  /**
   * 启动流式连接
   */
  const startStream = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) {
        addLog('❌ 提示词不能为空', 'ERROR');
        return;
      }

      setIsStreaming(true);
      setLogs([]);
      setSuspendInfo(null);
      bufferRef.current = '';

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const startTime = Date.now();
      const taskId = `TASK-${startTime}`;

      try {
        addLog(`🚀 启动流式连接 | Task ID: ${taskId}`, 'GATEWAY');
        addLog(`📝 Prompt: ${prompt}`, 'INPUT');

        // 从 localStorage 获取 Token
        const token = localStorage.getItem('nexusmind_token');
        if (!token) {
          throw new Error('Token 未找到，请重新登录');
        }

        addLog(`🔑 Token: ${token.substring(0, 20)}...`, 'AUTH');

        const url = `/api/v1/agent/stream?prompt=${encodeURIComponent(prompt)}&agent=Supervisor&agentRole=supervisor`;
        addLog(`📡 请求 URL: ${url}`, 'REQUEST');
        addLog(`🔐 请求头: Authorization: Bearer ${token.substring(0, 20)}...`, 'REQUEST');

        const response = await fetch(url, {
          method: 'GET',
          headers: { 
            'Accept': 'text/event-stream',
            'Authorization': `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorMsg = response.status === 403 
            ? `认证失败 (403): 请检查 Token 是否过期或角色权限不足`
            : `HTTP ${response.status}: ${response.statusText}`;
          throw new Error(errorMsg);
        }

        addLog('✅ SSE 连接已建立', 'GATEWAY');

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let chunkCount = 0;

        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            const elapsed = Date.now() - startTime;
            addLog(
              `✅ 流推送完成 | 耗时: ${elapsed}ms | 收包数: ${chunkCount}`,
              'COMPLETED'
            );
            break;
          }

          chunkCount++;
          const text = decoder.decode(value, { stream: true });
          processChunk(text);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          addLog('🛑 用户中断了连接', 'ABORT');
        } else {
          addLog(`❌ ${err.message}`, 'ERROR');
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [addLog, processChunk]
  );

  /**
   * 中止连接
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    logs,
    isStreaming,
    suspendInfo,
    setSuspendInfo,
    startStream,
    abort,
  };
}
