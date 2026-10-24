import { useState } from 'react';
import { useAgentStream } from './hooks/useAgentStream';
import { DestructiveConfirmModal } from './components/DestructiveConfirmModal';

interface LogItem {
  text: string;
  isError?: boolean;
}

/**
 * 切片 5：体验打磨与健壮性补充（倒计时 + Diff高亮代码预览）
 * 核心流程：输入 → 发送 → 流式日志 → 拦截弹窗(倒计时+Diff) → 核准/拒绝 → 回滚/删除
 */
export default function App() {
  const [prompt, setPrompt] = useState('delete old_file.py');
  const [customLogs, setCustomLogs] = useState<LogItem[]>([]);

  const {
    logs,
    isStreaming,
    suspendInfo,
    setSuspendInfo,
    startStream,
  } = useAgentStream();

  const displayLogs: LogItem[] = [
    ...logs.map((l) => ({ text: l })),
    ...customLogs,
  ];

  /**
   * 切片 5：核准并执行破坏性操作
   */
  const handleConfirm = async () => {
    if (!suspendInfo) return;

    try {
      const res = await fetch('/api/v1/task/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_id: suspendInfo.execution_id,
          token: suspendInfo.token,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCustomLogs((prev) => [
          ...prev,
          { text: `❌ [Supervisor] 恢复失败: ${data.message}`, isError: true },
        ]);
        return;
      }

      setSuspendInfo(null);
      setCustomLogs((prev) => [
        ...prev,
        { text: `✅ [Supervisor] ${data.message}` },
      ]);
    } catch (err: any) {
      setCustomLogs((prev) => [
        ...prev,
        { text: `❌ [Supervisor] 网络异常: ${err.message}`, isError: true },
      ]);
    }
  };

  /**
   * 切片 5：拒绝并回滚
   */
  const handleReject = async () => {
    if (!suspendInfo) return;

    try {
      const res = await fetch('/api/v1/task/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_id: suspendInfo.execution_id,
        }),
      });

      const data = await res.json();

      setSuspendInfo(null);
      setCustomLogs((prev) => [
        ...prev,
        {
          text: `🛑 [Supervisor] ${data.message || '用户拒绝操作，任务回滚中断'}`,
          isError: true,
        },
      ]);
    } catch (err: any) {
      setCustomLogs((prev) => [
        ...prev,
        { text: `❌ [Supervisor] 中止调用失败: ${err.message}`, isError: true },
      ]);
    }
  };

  return (
    <div
      style={{
        padding: '24px',
        fontFamily: 'monospace',
        backgroundColor: '#121212',
        color: '#eee',
        minHeight: '100vh',
      }}
    >
      <h2 style={{ color: '#60a5fa' }}>NexusMind Supervisor - 切片 5 (体验打磨与健壮性补充)</h2>

      {/* 指令交互区 */}
      <div style={{ display: 'flex', gap: '8px', margin: '16px 0' }}>
        <input
          style={{
            flex: 1,
            padding: '10px 12px',
            backgroundColor: '#1e1e1e',
            border: '1px solid #404040',
            borderRadius: '4px',
            color: '#eee',
            fontSize: '13px',
            fontFamily: 'monospace',
          }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isStreaming}
        />
        <button
          style={{
            padding: '10px 20px',
            backgroundColor: isStreaming ? '#4b5563' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isStreaming ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            opacity: isStreaming ? 0.5 : 1,
          }}
          onClick={() => {
            setCustomLogs([]);
            startStream(prompt);
          }}
          disabled={isStreaming}
        >
          {isStreaming ? '▶︎ 推流执行中...' : '▶︎ 发送指令'}
        </button>
      </div>

      {/* 控制台输出日志 */}
      <div
        style={{
          backgroundColor: '#000',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '16px',
          minHeight: '300px',
          maxHeight: '500px',
          overflowY: 'auto',
        }}
      >
        <div style={{ color: '#888', marginBottom: '12px', fontSize: '12px' }}>
          --- 🔍 执行控制台与审计流 ---
        </div>
        {displayLogs.length === 0 ? (
          <div style={{ color: '#666', fontSize: '13px', fontStyle: 'italic' }}>
            等待下发指令建立 SSE 通道...
          </div>
        ) : (
          displayLogs.map((log, idx) => (
            <div
              key={idx}
              style={{
                margin: '4px 0',
                fontSize: '12px',
                lineHeight: '1.5',
                color: log.isError ? '#f87171' : '#d1d5db',
                fontWeight: log.isError ? 'bold' : 'normal',
              }}
            >
              {log.text}
            </div>
          ))
        )}
      </div>

      {/* 破坏性阻断确认弹窗（带倒计时 + Diff预览） */}
      {suspendInfo && (
        <DestructiveConfirmModal
          data={suspendInfo}
          onConfirm={handleConfirm}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
