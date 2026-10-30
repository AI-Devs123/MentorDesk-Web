/**
 * 破坏性操作确认流辅助（Slice 5 / 5-B）
 *
 * 与后端 TaskExecutionController 的 /api/v1/task/resume、/api/v1/task/abort 对接。
 * DashboardPage 此前已内联实现同样逻辑；此处抽为共享函数，避免重复，并供
 * CodeAnalysisPanel 等其它面板复用同一契约。
 */
import { authStorage } from './auth';
import type { SuspendData } from '../types/agent';

export interface ConfirmResult {
  status: string;
  code?: string;
  message?: string;
}

function buildHeaders(): Record<string, string> {
  const token = authStorage.getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * 核准并恢复执行破坏性操作（携带一次性确认令牌）
 */
export async function resumeTask(suspend: SuspendData): Promise<ConfirmResult> {
  const res = await fetch('/api/v1/task/resume', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      execution_id: suspend.execution_id,
      token: suspend.token,
      promptHash: suspend.promptHash,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as ConfirmResult;
  if (!res.ok) {
    return {
      status: 'ERROR',
      code: String(res.status),
      message: data?.message ?? `HTTP ${res.status}`,
    };
  }
  return data ?? { status: 'SUCCESS' };
}

/**
 * 拒绝并回滚（中止任务）
 */
export async function abortTask(suspend: SuspendData): Promise<ConfirmResult> {
  const res = await fetch('/api/v1/task/abort', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ execution_id: suspend.execution_id }),
  });
  const data = (await res.json().catch(() => ({}))) as ConfirmResult;
  if (!res.ok) {
    return {
      status: 'ERROR',
      code: String(res.status),
      message: data?.message ?? `HTTP ${res.status}`,
    };
  }
  return data ?? { status: 'SUCCESS' };
}
