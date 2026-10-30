/**
 * Agent 流公共解释器（Slice 1）
 *
 * 仅负责把帧转成 Hook 级 logs + suspendInfo（DashboardPage 用）。
 * 三个挂起 stage 映射为 SuspendData；其余帧转成带 stage 前缀的日志。
 * 这是 4 个旧 hook 中唯一「共享 logs/suspend」语义的场景，故放在 Hook 内直接调用。
 */
import type { FrameInterpreter, StreamFrame } from '../eventTypes';
import { frameStr } from '../eventTypes';
import type { SuspendData } from '../../types/agent';

export const SUSPEND_STAGES = [
  'SUSPEND_FOR_CONFIRMATION',
  'LAYERS_CONFIRMATION_REQUIRED',
  'LAYER3_CONFIRMATION_REQUIRED',
];

export const agentInterpreter: FrameInterpreter = (frame: StreamFrame) => {
  const stage = frameStr(frame, 'stage') ?? '';
  const content = frameStr(frame, 'content') ?? '';
  const taskId = frameStr(frame, 'taskId') ?? '';
  const logs: { stage?: string; message: string }[] = [];

  if (SUSPEND_STAGES.includes(stage)) {
    const suspend: SuspendData = {
      execution_id: frameStr(frame, 'execution_id') ?? taskId ?? '',
      token: frameStr(frame, 'token') ?? '',
      promptHash: frameStr(frame, 'promptHash') ?? '',
      operation_type: frameStr(frame, 'operation_type') ?? 'UNKNOWN',
      risk_level: (frame.risk_level as SuspendData['risk_level']) ?? 'MEDIUM',
      description: frameStr(frame, 'description') ?? content ?? '破坏性操作',
      affected_files: (frame.affected_files as string[] | undefined) ?? [],
      expires_at:
        frameStr(frame, 'expires_at') ??
        new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    };
    logs.push({
      stage,
      message: `⚠️ 拦截到破坏性操作 | 任务ID: ${suspend.execution_id} | Token: ${suspend.token}`,
    });
    return { logs, suspend };
  }

  logs.push({ stage: stage || undefined, message: content });
  return { logs };
};
