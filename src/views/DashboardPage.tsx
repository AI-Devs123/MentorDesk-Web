import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNexusStream } from '../hooks/useNexusStream';
import { agentInterpreter } from '../stream/interpreters/agentInterpreter';
import { authStorage } from '../utils/auth';
import { TaskInput } from '../components/TaskInput';
import { LogViewer } from '../components/LogViewer';
import { DestructiveConfirmModal } from '../components/DestructiveConfirmModal';

interface LogItem {
  text: string;
  isError?: boolean;
}

/**
 * 执行控制台页面（原 App.tsx 的 dashboard 内容）
 *
 * 路由: / （MainLayout 子路由 index）
 * 职责: SSE 流式任务执行 + 破坏性操作确认 + 日志展示
 * 登录态由 MainLayout/RequireAuth 保障，本页不再处理认证分支。
 */
export const DashboardPage: React.FC = () => {
  const { logout } = useAuth();
  const [prompt, setPrompt] = useState('delete old_file.py');
  const [customLogs, setCustomLogs] = useState<LogItem[]>([]);

  const { logs, isStreaming, suspendInfo, setSuspendInfo, startStream } = useNexusStream({
    endpoint: '/api/v1/agent/stream',
    defaultQuery: { agent: 'Supervisor', agentRole: 'supervisor' },
    interpreter: agentInterpreter,
  });

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
    startStream({ prompt });
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
          promptHash: suspendInfo.promptHash,
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCustomLogs((prev) => [
        ...prev,
        { text: `❌ [Supervisor] 网络异常: ${msg}`, isError: true },
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCustomLogs((prev) => [
        ...prev,
        { text: `❌ [Supervisor] 中止调用失败: ${msg}`, isError: true },
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
        minHeight: 'calc(100vh - 60px)',
      }}
    >
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
};
