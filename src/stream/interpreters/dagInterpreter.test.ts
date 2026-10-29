import { describe, it, expect } from 'vitest';
import {
  interpretDagFrame,
  deriveStatuses,
  AGENT_FLOW_TOPOLOGY,
  type DagTopology,
} from './dagInterpreter';
import type { StreamFrame } from '../eventTypes';

describe('interpretDagFrame', () => {
  it('把已知阶段帧推进为 setActiveStage', () => {
    const r = interpretDagFrame({ stage: 'SECURITY_GUARD_SCAN' } as StreamFrame);
    expect(r.setActiveStage).toBe('SECURITY_GUARD_SCAN');
    expect(r.error).toBeUndefined();
    expect(r.freeze).toBeUndefined();
  });

  it('最后一个阶段也作为进度推进', () => {
    const r = interpretDagFrame({ stage: 'TASK_COMPLETED' } as StreamFrame);
    expect(r.setActiveStage).toBe('TASK_COMPLETED');
  });

  it('网关层硬错误帧产出 error 文案', () => {
    const r = interpretDagFrame({
      stage: 'AUTH_ERROR',
      content: '无效 Token',
    } as StreamFrame);
    expect(r.error).toContain('无效 Token');
    expect(r.setActiveStage).toBeUndefined();
  });

  it('破坏性挂起帧产出 error + freeze', () => {
    const r = interpretDagFrame({ stage: 'SUSPEND_FOR_CONFIRMATION' } as StreamFrame);
    expect(r.error).toContain('待确认');
    expect(r.freeze).toBe(true);
  });

  it('无 stage 的帧返回空结果', () => {
    const r = interpretDagFrame({ content: '心跳' } as StreamFrame);
    expect(r.setActiveStage).toBeUndefined();
    expect(r.error).toBeUndefined();
    expect(r.setTopology).toBeUndefined();
  });

  it('未知 stage 也当作进度推进（前向兼容后端新增阶段）', () => {
    const r = interpretDagFrame({ stage: 'CUSTOM_BACKEND_STAGE' } as StreamFrame);
    expect(r.setActiveStage).toBe('CUSTOM_BACKEND_STAGE');
  });

  it('显式 DAG_TOPOLOGY 帧走 setTopology 分支', () => {
    const topo: DagTopology = {
      nodes: [{ id: 'A', label: 'A' }],
      edges: [{ id: 'e', source: 'A', target: 'A' }],
    };
    const r = interpretDagFrame({
      stage: 'DAG_TOPOLOGY',
      topology: topo,
    } as unknown as StreamFrame);
    expect(r.setTopology).toBeDefined();
    expect(r.setTopology!.nodes[0].id).toBe('A');
  });
});

describe('deriveStatuses', () => {
  const topo = AGENT_FLOW_TOPOLOGY;

  it('激活节点之前的 done、自身 active、之后 pending', () => {
    const s = deriveStatuses(topo, 'WORKER_DISPATCH', null);
    expect(s['SECURITY_GUARD_SCAN']).toBe('done');
    expect(s['DAG_ORCHESTRATION']).toBe('done');
    expect(s['WORKER_DISPATCH']).toBe('active');
    expect(s['RAG_RETRIEVAL']).toBe('pending');
    expect(s['TASK_COMPLETED']).toBe('pending');
  });

  it('激活最后一个节点时全部 done', () => {
    const s = deriveStatuses(topo, 'TASK_COMPLETED', null);
    expect(s['TASK_COMPLETED']).toBe('done');
    expect(s['RAG_RETRIEVAL']).toBe('done');
  });

  it('未开始全部 pending', () => {
    const s = deriveStatuses(topo, null, null);
    expect(Object.values(s).every((v) => v === 'pending')).toBe(true);
  });

  it('错误节点标红', () => {
    const s = deriveStatuses(topo, 'RAG_RETRIEVAL', 'RAG_RETRIEVAL');
    expect(s['RAG_RETRIEVAL']).toBe('error');
  });
});
