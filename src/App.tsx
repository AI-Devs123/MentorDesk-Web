import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useAgentStream } from './hooks/useAgentStream';
import { authStorage } from './utils/auth';
import { LoginModal } from './components/LoginModal';
import { UserBar } from './components/UserBar';
import { TaskInput } from './components/TaskInput';
import { LogViewer } from './components/LogViewer';
import { DestructiveConfirmModal } from './components/DestructiveConfirmModal';

interface LogItem {
  text: string;
  isError?: boolean;
}

export default function App() {
  const { currentUser, isLoggedIn, isLoading, logout } = useAuth();
  const [prompt, setPrompt] = useState('cleanup old_file');
  const [customLogs, setCustomLogs] = useState<LogItem[]>([]);

  const { logs, isStreaming, suspendInfo, setSuspendInfo, startStream } = useAgentStream();

  // 如果还在加载认证状态，显示空屏
  if (isLoading) {
    return (
      <div style={{ background: '#09090b', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#888' }}>加载中...</div>
      </div>
    );
  }

  // 未登录时显示登录页
  if (!isLoggedIn) {
    return (
      <div style={{ background: '#09090b', minHeight: '100vh' }}>
        <LoginModal
          onLoginSuccess={() => {
            // 延迟一小段时间让 useAuth 检测到 localStorage 变化
            setTimeout(() => {
              // 强制重新检查认证状态
              window.dispatchEvent(new Event('storage'));
            }, 100);
          }}
        />
      </div>
    );
  }

  const displayLogs: LogItem[] = [...logs.map((l) => ({ text: l })), ...customLogs];

  /**
   * 带 Token 的任务启动
   */
  const handleStartTask = () => {
    const token = authStorage.getToken();
    if (!token) {
      setCustomLogs((prev) => [
        ...prev,
        { text: '❌ Token 已过期，请重新登录', isError: true },
      ]);
      logout();
      return;
    }

    setCustomLogs([]);
    startStream(prompt);
  };

  /**
   * 核准并执行破坏性操作
   */
  const handleConfirm = async () => {
    if (!suspendInfo) return;

    try {
      const token = authStorage.getToken();
      if (!token) {
        setCustomLogs((prev) => [
          ...prev,
          { text: '❌ Token 已过期，请重新登录', isError: true },
        ]);
        logout();
        return;
      }

      const res = await fetch('/api/v1/task/resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
   * 拒绝并回滚
   */
  const handleReject = async () => {
    if (!suspendInfo) return;

    try {
      const token = authStorage.getToken();
      if (!token) {
        setCustomLogs((prev) => [
          ...prev,
          { text: '❌ Token 已过期，请重新登录', isError: true },
        ]);
        logout();
        return;
      }

      const res = await fetch('/api/v1/task/abort', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
      {/* 用户栏与退出登录 */}
      <UserBar user={currentUser} onLogout={logout} />

      {/* 任务输入框 */}
      <TaskInput value={prompt} onChange={setPrompt} onSubmit={handleStartTask} isLoading={isStreaming} />

      {/* 日志查看器 */}
      <LogViewer logs={displayLogs.map((log) => (log.isError ? `❌ ${log.text}` : log.text))} />

      {/* 破坏性操作确认弹窗 */}
      {suspendInfo && (
        <DestructiveConfirmModal data={suspendInfo} onConfirm={handleConfirm} onReject={handleReject} />
      )}
    </div>
  );
}
