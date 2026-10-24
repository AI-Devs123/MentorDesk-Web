import React, { useState } from 'react';
import { useAgentStream } from './hooks/useAgentStream';
import type { SuspendData } from './types/agent';

interface LogItem {
  text: string;
  isError?: boolean;
}

/**
 * 切片 4：拒绝与回滚（Abort）闭环
 * 核心流程：输入 → 发送 → 流式日志 → 拦截弹窗 → 核准/拒绝 → 回滚/删除
 */
export default function App() {
  const [prompt, setPrompt] = useState('delete old_file.py');
  const [isSubmitting, setIsSubmitting] = useState(false);
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
   * 切片 3：调用真实恢复接口
   */
  const handleConfirm = async () => {
    if (!suspendInfo) return;

    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 切片 4：拒绝与熔断回滚
   */
  const handleReject = async () => {
    if (!suspendInfo) return;

    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
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
      <h2 style={{ color: '#60a5fa' }}>NexusMind Supervisor - 切片 4 (Abort 熔断回滚闭环)</h2>

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

      {/* 破坏性阻断确认弹窗 */}
      {suspendInfo && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e1010',
              border: '2px solid #ef4444',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              color: '#fff',
              fontFamily: 'monospace',
            }}
          >
            <h3 style={{ color: '#ef4444', margin: '0 0 16px 0' }}>
              ⚠️ 拦截到破坏性操作 (SUSPEND_FOR_CONFIRMATION)
            </h3>

            <div style={{ fontSize: '14px', lineHeight: '1.8', marginBottom: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <span style={{ color: '#9ca3af', fontWeight: 'bold', marginRight: '8px' }}>
                  执行ID:
                </span>
                {suspendInfo.execution_id}
              </div>

              <div style={{ marginBottom: '12px' }}>
                <span style={{ color: '#9ca3af', fontWeight: 'bold', marginRight: '8px' }}>
                  操作类型:
                </span>
                {suspendInfo.operation_type}
              </div>

              <div style={{ marginBottom: '12px' }}>
                <span style={{ color: '#9ca3af', fontWeight: 'bold', marginRight: '8px' }}>
                  风险等级:
                </span>
                <span style={{ color: '#fca5a5' }}>{suspendInfo.risk_level}</span>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <span style={{ color: '#9ca3af', fontWeight: 'bold', marginRight: '8px' }}>
                  描述:
                </span>
                {suspendInfo.description}
              </div>

              {suspendInfo.affected_files && suspendInfo.affected_files.length > 0 && (
                <div>
                  <span style={{ color: '#9ca3af', fontWeight: 'bold', marginRight: '8px' }}>
                    受影响文件:
                  </span>
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px 12px',
                      backgroundColor: '#2b1515',
                      borderRadius: '4px',
                      borderLeft: '3px solid #ef4444',
                      color: '#fca5a5',
                    }}
                  >
                    {suspendInfo.affected_files.map((f, i) => (
                      <div key={i}>• {f}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4b5563',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  fontWeight: 'normal',
                  opacity: isSubmitting ? 0.5 : 1,
                }}
                disabled={isSubmitting}
                onClick={handleReject}
              >
                {isSubmitting ? '处理中...' : '❌ 拒绝执行'}
              </button>
              <button
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  opacity: isSubmitting ? 0.5 : 1,
                }}
                disabled={isSubmitting}
                onClick={handleConfirm}
              >
                {isSubmitting ? '处理中...' : '✅ 核准并执行'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
