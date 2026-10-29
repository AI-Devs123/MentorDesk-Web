import { describe, expect, it } from 'vitest';
import type { StreamFrame } from './eventTypes';
import { dagReducer, INITIAL_DAG_STATE, type DagState } from './dagStateMachine';

function frame(stage: string, extra: Partial<StreamFrame> = {}): StreamFrame {
  return { stage, content: `content-${stage}`, ...extra };
}

/** 顺次喂入若干帧 */
function feed(stages: string[], start: DagState = INITIAL_DAG_STATE): DagState {
  return stages.reduce((s, st) => dagReducer(s, { type: 'frame', frame: frame(st) }), start);
}

describe('dagReducer', () => {
  it('阶段帧推进激活节点', () => {
    const s1 = feed(['SECURITY_GUARD_SCAN']);
    expect(s1.activeStageId).toBe('SECURITY_GUARD_SCAN');
    expect(s1.errorMsg).toBeNull();

    const s2 = feed(['DAG_ORCHESTRATION'], s1);
    expect(s2.activeStageId).toBe('DAG_ORCHESTRATION');
  });

  it('错误帧把「当前激活节点」标红并记录原因', () => {
    const before = feed(['SECURITY_GUARD_SCAN', 'DAG_ORCHESTRATION', 'WORKER_DISPATCH']);
    const s = dagReducer(before, { type: 'frame', frame: frame('AUTH_ERROR', { content: 'JWT 已过期' }) });

    expect(s.activeStageId).toBe('WORKER_DISPATCH'); // 激活节点不被错误帧推进
    expect(s.errorStageId).toBe('WORKER_DISPATCH'); // 当前节点标红
    expect(s.errorMsg).toBe('JWT 已过期');
  });

  it('回到首个节点视为新一轮执行：清空上一轮异常与进度', () => {
    const errored = dagReducer(
      feed(['SECURITY_GUARD_SCAN', 'WORKER_DISPATCH']),
      { type: 'frame', frame: frame('AUTH_ERROR', { content: 'boom' }) },
    );
    expect(errored.errorMsg).toBe('boom');

    const restarted = dagReducer(errored, { type: 'frame', frame: frame('SECURITY_GUARD_SCAN') });
    expect(restarted.activeStageId).toBe('SECURITY_GUARD_SCAN');
    expect(restarted.errorMsg).toBeNull();
    expect(restarted.errorStageId).toBeNull();
    expect(restarted.focused).toBeNull();
  });

  it('显式 DAG_TOPOLOGY 帧整图替换并清空推进状态', () => {
    const before = feed(['SECURITY_GUARD_SCAN', 'DAG_ORCHESTRATION']);
    const custom = {
      nodes: [
        { id: 'P', label: '规划' },
        { id: 'A1', label: '子任务A' },
        { id: 'A2', label: '子任务B' },
        { id: 'R', label: '汇总' },
      ],
      edges: [
        { id: 'e1', source: 'P', target: 'A1' },
        { id: 'e2', source: 'P', target: 'A2' },
        { id: 'e3', source: 'A1', target: 'R' },
        { id: 'e4', source: 'A2', target: 'R' },
      ],
    };

    const s = dagReducer(before, {
      type: 'frame',
      frame: { stage: 'DAG_TOPOLOGY', topology: custom } as StreamFrame,
    });

    expect(s.topology.nodes).toHaveLength(4);
    expect(s.activeStageId).toBeNull();
    expect(s.errorStageId).toBeNull();
  });

  it('focus 聚焦节点，随后阶段帧推进时自动清空聚焦', () => {
    const focused = dagReducer(INITIAL_DAG_STATE, {
      type: 'focus',
      label: '安全网关扫描',
      description: 'RAG 安全防护检测',
    });
    expect(focused.focused?.label).toBe('安全网关扫描');

    const next = dagReducer(focused, { type: 'frame', frame: frame('DAG_ORCHESTRATION') });
    expect(next.focused).toBeNull();
  });

  it('未知 stage 一律当作进度推进（后端加阶段不会卡住看板）', () => {
    const s = dagReducer(feed(['SECURITY_GUARD_SCAN']), {
      type: 'frame',
      frame: frame('SOME_FUTURE_STAGE'),
    });
    expect(s.activeStageId).toBe('SOME_FUTURE_STAGE');
    expect(s.errorMsg).toBeNull();
  });

  it('无 stage 的帧不改变状态', () => {
    const before = feed(['DAG_ORCHESTRATION']);
    const after = dagReducer(before, { type: 'frame', frame: { content: 'pure text' } as StreamFrame });
    expect(after).toBe(before); // 引用不变，避免无意义重渲染
  });
});
