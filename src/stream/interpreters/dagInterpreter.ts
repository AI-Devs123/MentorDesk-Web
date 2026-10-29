/**
 * DAG 拓扑解释器（Slice 2）
 *
 * 数据来源决策（已现实核对后端）：当前 supervisor 的 agent 流是 5 阶段顺序 demo 桩，
 * 每帧仅 {taskId,timestamp,stage,content}（data-only 协议），**没有节点/边结构的拓扑帧**。
 * 因此 DAG 看板采用「前端从现有 stage 帧派生实时执行 DAG」方案：零后端改动，对接当前
 * demo 即可工作。
 *
 * 预留通道：若后端未来发射显式 DAG_TOPOLOGY 帧（节点 + 边），解释器会走 setTopology 分支，
 * 面板无需改动即可渲染真实编排图。
 */
import type { StreamFrame } from '../eventTypes';

export type DagNodeStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped';

export interface DagNodeDef {
  id: string;
  label: string;
  description?: string;
}

export interface DagEdgeDef {
  id: string;
  source: string;
  target: string;
}

export interface DagTopology {
  nodes: DagNodeDef[];
  edges: DagEdgeDef[];
}

/**
 * 已知主 agent 流 5 阶段（与后端 AgentStreamingFacadeImpl 的 stages 顺序严格一致）。
 * 一旦后端提供 DAG_TOPOLOGY 帧，此常量仅作为「无拓扑帧时的默认骨架」。
 */
export const AGENT_FLOW_TOPOLOGY: DagTopology = {
  nodes: [
    {
      id: 'SECURITY_GUARD_SCAN',
      label: '安全网关扫描',
      description: 'RAG 安全防护检测，拦截敏感信息',
    },
    {
      id: 'DAG_ORCHESTRATION',
      label: '任务编排',
      description: '生成 DAG 拓扑，规划子任务依赖',
    },
    { id: 'WORKER_DISPATCH', label: '任务分发', description: '向 WorkerAgent 集群分发执行' },
    {
      id: 'RAG_RETRIEVAL',
      label: '知识检索',
      description: '混合召回（向量 + BM25）Top-K',
    },
    { id: 'TASK_COMPLETED', label: '执行完毕', description: '生成执行报告并归档' },
  ],
  edges: [
    { id: 'e1', source: 'SECURITY_GUARD_SCAN', target: 'DAG_ORCHESTRATION' },
    { id: 'e2', source: 'DAG_ORCHESTRATION', target: 'WORKER_DISPATCH' },
    { id: 'e3', source: 'WORKER_DISPATCH', target: 'RAG_RETRIEVAL' },
    { id: 'e4', source: 'RAG_RETRIEVAL', target: 'TASK_COMPLETED' },
  ],
};

/** 网关层错误/终止类 stage（data-only 协议，无 event: 行），用于把当前节点标红 */
export const DAG_ERROR_STAGES: ReadonlySet<string> = new Set<string>([
  'AUTH_ERROR',
  'RBAC_ACCESS_DENIED',
  'RBAC_SETUP_ERROR',
  'LAYER2_BLACKLIST_BLOCKED',
  'LAYER3_TOKEN_GENERATION_FAILED',
  'TOKEN_INVALID',
]);

export interface DagInterpreterResult {
  /** 显式拓扑帧（未来后端 DAG_TOPOLOGY 就绪后启用）：直接替换整张图 */
  setTopology?: DagTopology;
  /** 推进到某个 stage 为 active（其前的节点自动 done，其后的 pending） */
  setActiveStage?: string;
  /** 错误/挂起文案：非空时把当前 active 节点标红 */
  error?: string;
  /** 是否冻结（如破坏性操作挂起）：面板据此停止推进 */
  freeze?: boolean;
}

/**
 * 解释单帧，产出 DAG 面板需要的状态增量。
 * 纯函数、零依赖，便于单测。
 */
export function interpretDagFrame(frame: StreamFrame): DagInterpreterResult {
  const stage = frame.stage;

  // 未来通道：显式拓扑帧（event: 行或 data-only 带 topology 字段）
  if (stage === 'DAG_TOPOLOGY' && frame.topology) {
    return { setTopology: frame.topology as unknown as DagTopology };
  }

  if (!stage) return {};

  // 破坏性操作挂起：流中断，当前节点标红并冻结
  if (stage === 'SUSPEND_FOR_CONFIRMATION') {
    return { error: '⏸ 破坏性操作待确认', freeze: true };
  }

  // 网关层硬错误：标红
  if (DAG_ERROR_STAGES.has(stage)) {
    return { error: frame.content != null ? String(frame.content) : stage };
  }

  // 正常阶段推进（含后端未来可能新增的未知 stage，一律当作进度推进）
  return { setActiveStage: stage };
}

/**
 * 由「当前激活 stage」推导每个节点的状态。
 * 约定：激活节点之前的全部 done，激活节点 active（若为最后一个则 done），之后 pending。
 */
export function deriveStatuses(
  topology: DagTopology,
  activeStageId: string | null,
  errorStageId: string | null,
): Record<string, DagNodeStatus> {
  const idx = topology.nodes.findIndex((n) => n.id === activeStageId);
  const errIdx = topology.nodes.findIndex((n) => n.id === errorStageId);
  const map: Record<string, DagNodeStatus> = {};
  topology.nodes.forEach((n, i) => {
    if (errIdx !== -1 && i === errIdx) {
      map[n.id] = 'error';
    } else if (idx === -1) {
      map[n.id] = 'pending';
    } else if (i < idx) {
      map[n.id] = 'done';
    } else if (i === idx) {
      map[n.id] = idx === topology.nodes.length - 1 ? 'done' : 'active';
    } else {
      map[n.id] = 'pending';
    }
  });
  return map;
}
