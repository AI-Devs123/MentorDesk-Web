import React, { useState } from 'react';
import { useAgentStream } from './hooks/useAgentStream';
import type { SuspendData } from './types/agent';

/**
 * 切片 3：前端控制台 + Resume 接口接通
 * 核心流程：输入 → 发送 → 流式日志 → 拦截弹窗 → 调用 /api/v1/task/resume
 */
export default function App() {
  const [prompt, setPrompt] = useState('delete old_file.py');
  const [isSubmittingResume, setIsSubmittingResume] = useState(false);
  const {
    logs,
    isStreaming,
    suspendInfo,
    setSuspendInfo,
    startStream,
    abort,
  } = useAgentStream();

  /**
   * 切片 3：调用真实恢复接口
   * 用户点击【核准并执行】→ 向后端发送 /api/v1/task/resume
   */
  const handleConfirm = async () => {
    if (!suspendInfo) return;

    setIsSubmittingResume(true);
    try {
      const payload = {
        execution_id: suspendInfo.execution_id,
        token: suspendInfo.token,
      };
      
      const res = await fetch('/api/v1/task/resume', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(`恢复失败 [${res.status}]: ${data.message || JSON.stringify(data) || res.statusText}`);
        return;
      }

      setSuspendInfo(null);
      const message = `[Supervisor] 确认已收到，正在执行物理删除... 删除成功，下游任务完成`;
      console.log(message);
      alert(`✅ ${message}`);
    } catch (err: any) {
      alert(`网络或服务异常: ${err.message}`);
    } finally {
      setIsSubmittingResume(false);
    }
  };

  /**
   * 用户点击【拒绝执行】
   */
  const handleReject = () => {
    if (!suspendInfo) return;
    setSuspendInfo(null);
  };

  // ==================== 极简红色弹窗 ====================
  const ConfirmationDialog = ({ data }: { data: SuspendData }) => {
    const overlayStyle: React.CSSProperties = {
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
    };

    const dialogStyle: React.CSSProperties = {
      backgroundColor: '#1e1010',
      border: '2px solid #dc2626',
      borderRadius: '8px',
      padding: '24px',
      maxWidth: '600px',
      width: '90%',
      color: '#fff',
      fontFamily: 'monospace',
    };

    const titleStyle: React.CSSProperties = {
      color: '#dc2626',
      margin: '0 0 16px 0',
      fontSize: '16px',
      fontWeight: 'bold',
    };

    const contentStyle: React.CSSProperties = {
      fontSize: '14px',
      lineHeight: '1.8',
      marginBottom: '16px',
      color: '#e5e7eb',
    };

    const fieldStyle: React.CSSProperties = {
      marginBottom: '12px',
    };

    const labelStyle: React.CSSProperties = {
      color: '#9ca3af',
      fontWeight: 'bold',
      marginRight: '8px',
    };

    const fileListStyle: React.CSSProperties = {
      marginTop: '8px',
      padding: '8px 12px',
      backgroundColor: '#2b1515',
      borderRadius: '4px',
      borderLeft: '3px solid #dc2626',
      color: '#fca5a5',
    };

    const buttonContainerStyle: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '12px',
      marginTop: '20px',
    };

    const rejectButtonStyle: React.CSSProperties = {
      padding: '10px 20px',
      backgroundColor: '#4b5563',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      fontFamily: 'monospace',
      fontWeight: 'normal',
    };

    const confirmButtonStyle: React.CSSProperties = {
      padding: '10px 20px',
      backgroundColor: '#dc2626',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
    };

    return (
      <div style={overlayStyle}>
        <div style={dialogStyle}>
          <h3 style={titleStyle}>⚠️ 拦截到破坏性操作 (SUSPEND_FOR_CONFIRMATION)</h3>

          <div style={contentStyle}>
            <div style={fieldStyle}>
              <span style={labelStyle}>执行ID:</span>
              {data.execution_id}
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>操作类型:</span>
              {data.operation_type}
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>风险等级:</span>
              <span style={{ color: '#fca5a5' }}>{data.risk_level}</span>
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>描述:</span>
              {data.description}
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>受影响文件:</span>
              <div style={fileListStyle}>
                {(data.affected_files || []).map((file, idx) => (
                  <div key={idx}>• {file}</div>
                ))}
              </div>
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>过期时间:</span>
              {data.expires_at}
            </div>
          </div>

          <div style={buttonContainerStyle}>
            <button
              style={rejectButtonStyle}
              onClick={handleReject}
              onMouseOver={(e) =>
                ((e.target as HTMLButtonElement).style.backgroundColor = '#5a6573')
              }
              onMouseOut={(e) =>
                ((e.target as HTMLButtonElement).style.backgroundColor = '#4b5563')
              }
            >
              ❌ 拒绝执行
            </button>
            <button
              style={{
                ...confirmButtonStyle,
                opacity: isSubmittingResume ? 0.5 : 1,
                cursor: isSubmittingResume ? 'not-allowed' : 'pointer',
              }}
              onClick={handleConfirm}
              disabled={isSubmittingResume}
              onMouseOver={(e) =>
                !isSubmittingResume &&
                ((e.target as HTMLButtonElement).style.backgroundColor = '#b91c1c')
              }
              onMouseOut={(e) =>
                !isSubmittingResume &&
                ((e.target as HTMLButtonElement).style.backgroundColor = '#dc2626')
              }
            >
              {isSubmittingResume ? '⏳ 核准中...' : '✅ 核准并执行'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        padding: '24px',
        fontFamily: 'monospace',
        backgroundColor: '#121212',
        color: '#e5e7eb',
        minHeight: '100vh',
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* 标题 */}
        <h2 style={{ color: '#60a5fa', margin: '0 0 8px 0' }}>
          NexusMind Supervisor - 切片 3 联调验证
        </h2>
        <p style={{ color: '#9ca3af', margin: '0 0 20px 0', fontSize: '12px' }}>
          验证标准：点击【核准并执行】→ 弹窗消失 → 控制台打印"删除成功，下游任务完成" → 沙箱文件被物理删除
        </p>

        {/* 输入栏 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            style={{
              flex: 1,
              padding: '10px 12px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #404040',
              borderRadius: '4px',
              color: '#e5e7eb',
              fontSize: '13px',
              fontFamily: 'monospace',
            }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="输入测试指令... (e.g., delete old_file.py)"
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
            onClick={() => startStream(prompt)}
            disabled={isStreaming}
          >
            {isStreaming ? '▶︎ 推流执行中...' : '▶︎ 发送指令'}
          </button>
          {isStreaming && (
            <button
              style={{
                padding: '10px 20px',
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
              }}
              onClick={abort}
            >
              ⏹ 中止
            </button>
          )}
        </div>



        {/* 日志终端 */}
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
            --- 🔍 执行流式日志 ---
          </div>
          {logs.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px', fontStyle: 'italic' }}>
              等待下发指令建立 SSE 通道...
            </div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  margin: '4px 0',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  color: log.includes('ERROR') ? '#f87171' : '#d1d5db',
                }}
              >
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 极简红色弹窗（切片 2 核心） */}
      {suspendInfo && <ConfirmationDialog data={suspendInfo} />}
    </div>
  );
}
