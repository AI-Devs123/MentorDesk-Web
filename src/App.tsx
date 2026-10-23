import React, { useState, useRef } from 'react';

// ==================== 类型定义 ====================

// 标准流式数据帧
interface StreamChunk {
  timestamp: number;
  stage: string;
  content: string;
}

// 安全事件：RBAC 403 / 沙箱越界
interface SecurityEvent {
  type: 'SECURITY_VIOLATION' | 'PERMISSION_DENIED' | 'SANDBOX_BREACH';
  agent: string;
  reason: string;
  level: 'WARNING' | 'CRITICAL';
  timestamp: number;
  details?: string;
}

// 错误事件
interface ErrorEvent {
  type: 'ERROR';
  code: string;
  message: string;
  timestamp: number;
}

export const App: React.FC = () => {
  // ==================== 状态管理 ====================
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('扫描全库AST结构并构建依赖拓扑');
  
  // 安全事件状态
  const [securityAlerts, setSecurityAlerts] = useState<SecurityEvent[]>([]);
  
  const [diagnostics, setDiagnostics] = useState<{
    taskId?: string;
    chunksReceived: number;
    bytesReceived: number;
    startTime?: number;
    lastChunkTime?: number;
  }>({ chunksReceived: 0, bytesReceived: 0 });

  // 用于保存当前流的 AbortController 实例引用，方便随时主动中断
  const abortControllerRef = useRef<AbortController | null>(null);

  // ==================== 事件处理与日志 ====================

  // 判断事件类型并处理
  const processStreamEvent = (payload: any): boolean => {
    // 检查是否为安全事件
    if (payload.type === 'SECURITY_VIOLATION' || payload.type === 'PERMISSION_DENIED' || payload.type === 'SANDBOX_BREACH') {
      const securityEvent: SecurityEvent = {
        type: payload.type,
        agent: payload.agent || 'Unknown',
        reason: payload.message || payload.reason || '未知原因',
        level: payload.level || 'CRITICAL',
        timestamp: payload.timestamp || Date.now(),
        details: payload.details || payload.stack,
      };
      
      // 添加到安全告警列表
      setSecurityAlerts(prev => [...prev, securityEvent]);
      
      // 记录到日志（带视觉强调）
      const icon = securityEvent.level === 'CRITICAL' ? '🚨' : '⚠️';
      const logEntry = `${icon} [SecurityGuard 拦截] Agent: ${securityEvent.agent} | 原因: ${securityEvent.reason}`;
      setLogs(prev => [...prev, logEntry]);
      
      if (securityEvent.details) {
        setLogs(prev => [...prev, `   详情: ${securityEvent.details}`]);
      }
      
      return true; // 表示已处理安全事件
    }
    
    // 检查是否为错误事件
    if (payload.type === 'ERROR') {
      const errorEvent: ErrorEvent = {
        type: 'ERROR',
        code: payload.code || 'UNKNOWN',
        message: payload.message || '未知错误',
        timestamp: payload.timestamp || Date.now(),
      };
      
      const logEntry = `❌ [业务异常] Code: ${errorEvent.code} | Message: ${errorEvent.message}`;
      setLogs(prev => [...prev, logEntry]);
      
      return true; // 表示已处理错误事件
    }
    
    return false; // 不是特殊事件
  };

  // 核心：使用 fetch + ReadableStream 消费 SSE 流
  const handleStartStream = async () => {
    if (!prompt.trim()) return;

    setIsRunning(true);
    setLogs([]); // 清空上一轮日志
    setSecurityAlerts([]); // 清空安全告警

    const startTime = Date.now();
    const taskId = `TASK-${startTime}`;
    
    setDiagnostics({
      taskId,
      chunksReceived: 0,
      bytesReceived: 0,
      startTime,
      lastChunkTime: startTime
    });

    // 1. 初始化中断控制器
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLogs(prev => [...prev, `📡 [GATEWAY] 正在建立 SSE 连接到网关...`]);
      setLogs(prev => [...prev, `   Task ID: ${taskId}`]);
      setLogs(prev => [...prev, `   Prompt: ${prompt}`]);

      // 2. 发起请求，明确接收类型为 text/event-stream，并绑定 signal
      const response = await fetch(
        `/api/v1/agent/stream?prompt=${encodeURIComponent(prompt)}&agent=Supervisor`,
        {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
          },
          signal: controller.signal, // 挂载中断信号
        }
      );

      if (!response.ok) {
        // HTTP 错误：可能是 403 Forbidden / 401 Unauthorized
        if (response.status === 403) {
          setLogs(prev => [...prev, `🚨 [RBAC] 访问被拒绝 (HTTP 403)`]);
          setLogs(prev => [...prev, `   原因: 当前用户无权执行此任务`]);
          setSecurityAlerts(prev => [...prev, {
            type: 'PERMISSION_DENIED',
            agent: 'Gateway',
            reason: '用户权限不足',
            level: 'CRITICAL',
            timestamp: Date.now(),
            details: `HTTP ${response.status}: ${response.statusText}`,
          }]);
        } else if (response.status === 401) {
          setLogs(prev => [...prev, `🚨 [AUTH] 认证失败 (HTTP 401)`]);
          setSecurityAlerts(prev => [...prev, {
            type: 'PERMISSION_DENIED',
            agent: 'Gateway',
            reason: '用户未认证',
            level: 'CRITICAL',
            timestamp: Date.now(),
            details: `HTTP ${response.status}: ${response.statusText}`,
          }]);
        } else {
          throw new Error(`HTTP 异常: ${response.status} ${response.statusText}`);
        }
        return;
      }

      setLogs(prev => [...prev, `✅ [GATEWAY] SSE 连接已建立 (HTTP 200)`]);
      setLogs(prev => [...prev, `🔗 [SUPERVISOR] 等待后端 Triple 流式推送...`]);

      // 3. 校验并获取 body 的底层 ReadableStream 阅读器
      if (!response.body) {
        throw new Error('当前环境不支持 ReadableStream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = ''; // 缓冲区：解决网络传输分片导致的"半包/粘包"
      let chunkCount = 0;
      let totalBytes = 0;

      // 4. 循环读取推流数据
      while (true) {
        const { value, done } = await reader.read();

        // 读到流终态，跳出循环
        if (done) {
          const elapsed = Date.now() - startTime;
          setLogs(prev => [...prev, '🏁 [COMPLETED] 后端任务流式推送完毕']);
          setLogs(prev => [...prev, `📊 [STATS] 总耗时: ${elapsed}ms | 共收: ${chunkCount} 数据帧 | ${totalBytes} 字节`]);
          
          // 检查是否有安全告警
          if (securityAlerts.length > 0) {
            setLogs(prev => [...prev, `⚠️ [汇总] 本次执行中检测到 ${securityAlerts.length} 个安全事件`]);
          }
          break;
        }

        // 统计网络分块
        chunkCount++;
        const chunkBytes = value?.length || 0;
        totalBytes += chunkBytes;

        // 将读取到的 Uint8Array 二进制分块解码为纯文本
        buffer += decoder.decode(value, { stream: true });

        // SSE 规范以换行符 `\n\n` 或 `\n` 切分每帧数据
        const lines = buffer.split('\n');
        // 将最后一行不完整的内容放回缓冲区，等待下一次 chunk 到达
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();

          // 只处理以 data: 开头的有效数据帧
          if (trimmedLine.startsWith('data:')) {
            const rawJson = trimmedLine.replace(/^data:\s*/, '');
            try {
              const payload = JSON.parse(rawJson);
              
              // 尝试处理为特殊事件（安全/错误）
              if (processStreamEvent(payload)) {
                // 已作为特殊事件处理，跳过标准处理
                continue;
              }
              
              // 作为标准流式数据帧处理
              if (payload.timestamp && payload.stage && payload.content !== undefined) {
                const timeStr = new Date(payload.timestamp).toLocaleTimeString();
                const formattedLog = `[${timeStr}] [${payload.stage}] ${payload.content}`;
                setLogs(prev => [...prev, formattedLog]);
              }
              
              // 更新诊断信息
              setDiagnostics(prev => ({
                ...prev,
                chunksReceived: prev.chunksReceived + 1,
                bytesReceived: prev.bytesReceived + rawJson.length,
                lastChunkTime: Date.now()
              }));
            } catch {
              // 容错：如果后端推送的不是 JSON，直接作为纯文本输出
              if (rawJson) {
                setLogs(prev => [...prev, rawJson]);
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 用户主动点击取消触发的异常
        const elapsed = Date.now() - startTime;
        setLogs(prev => [
          ...prev,
          '🛑 [CLIENT_ABORT] 用户主动中断了任务执行，已向网关发送 RST_STREAM 信号。'
        ]);
        setLogs(prev => [...prev, `📊 [STATS] 中断耗时: ${elapsed}ms`]);
      } else {
        // 网络异常或其他错误
        setLogs(prev => [...prev, `❌ [STREAM_ERROR] ${err.message}`]);
        setLogs(prev => [...prev, `💡 [DEBUG] 确保后端服务已启动: http://localhost:8080`]);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  // 客户端中断方法
  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // ==================== UI 组件 ====================

  // 安全告警徽章组件
  const SecurityAlertBadge = ({ alert }: { alert: SecurityEvent }) => {
    const borderColor = alert.level === 'CRITICAL' ? 'border-red-600' : 'border-yellow-600';
    const bgColor = alert.level === 'CRITICAL' ? 'bg-red-950' : 'bg-yellow-950';
    const textColor = alert.level === 'CRITICAL' ? 'text-red-200' : 'text-yellow-200';
    const icon = alert.level === 'CRITICAL' ? '🚨' : '⚠️';

    return (
      <div className={`border-2 ${borderColor} ${bgColor} rounded-lg p-4 mb-4`}>
        <div className={`${textColor} text-sm font-semibold mb-2`}>
          {icon} SecurityGuard 拦截
        </div>
        <div className="space-y-1">
          <div className={`${textColor} text-xs`}>
            <span className="font-mono">Agent:</span> {alert.agent}
          </div>
          <div className={`${textColor} text-xs`}>
            <span className="font-mono">原因:</span> {alert.reason}
          </div>
          <div className={`${textColor} text-xs`}>
            <span className="font-mono">级别:</span> {alert.level}
          </div>
          {alert.details && (
            <div className={`${textColor} text-xs`}>
              <span className="font-mono">详情:</span> {alert.details}
            </div>
          )}
          <div className={`${textColor} text-xs opacity-70`}>
            {new Date(alert.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-mono">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 顶部标题栏 */}
        <header className="border-b border-slate-800 pb-4">
          <h1 className="text-xl font-bold text-sky-400">MentorDesk / NexusMind 控制台</h1>
          <p className="text-xs text-slate-400 mt-1">
            全链路：React (fetch + ReadableStream) ➔ Gateway (SSE) ➔ Supervisor (Triple Stream)
          </p>
          <div className="mt-2 text-xs text-slate-500 space-y-1">
            <div>📊 Task ID: {diagnostics.taskId || '-'}</div>
            <div>📈 数据帧: {diagnostics.chunksReceived} | 字节数: {diagnostics.bytesReceived}</div>
          </div>
        </header>

        {/* 安全告警面板 */}
        {securityAlerts.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-red-400">
              🔐 安全事件汇总 ({securityAlerts.length})
            </div>
            {securityAlerts.map((alert, idx) => (
              <SecurityAlertBadge key={idx} alert={alert} />
            ))}
          </div>
        )}

        {/* 输入框与操作按钮 */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isRunning}
              placeholder="输入任务指令..."
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-sky-500 disabled:opacity-50"
            />
            <button
              onClick={handleStartStream}
              disabled={isRunning}
              className="px-5 py-2 rounded bg-sky-600 hover:bg-sky-500 font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed">
              {isRunning ? '任务执行中...' : '启动推流'}
            </button>
            <button
              onClick={handleAbort}
              disabled={!isRunning}
              className="px-5 py-2 rounded bg-rose-600 hover:bg-rose-500 font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed">
              中断连接
            </button>
          </div>
        </div>

        {/* 流式日志终端窗口 */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 h-[450px] overflow-y-auto space-y-2">
          {logs.length === 0 ? (
            <div className="text-slate-500 text-sm italic">等待下发指令建立 SSE 通道...</div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className="text-sm leading-relaxed border-b border-slate-800/40 pb-1 font-mono">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
