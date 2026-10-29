/**
 * 执行 DAG 拓扑看板（Slice 2 · React Flow 渲染）
 *
 * 设计：
 *  - **复用 Slice 1 统一内核**：作为 DashboardPage 的子组件，接收 `subscribe` 与 `isStreaming`，
 *    复用同一条 agent 流 SSE 连接（不另开连接），把「单一内核 + 广播」兑现到底。
 *  - **数据来源**：后端 agent 流当前是 5 阶段 demo 桩、无拓扑帧，故用 `dagInterpreter`
 *    从 stage 帧**前端派生**执行 DAG；若后端未来发射显式 `DAG_TOPOLOGY` 帧，
 *    解释器会走 `setTopology` 分支，本组件自动渲染真实编排图，无需改动。
 *  - **状态**：整块用 `useReducer` 收敛（拓扑 / 激活节点 / 错误 / 选中详情），
 *    使「错误帧要把当前激活节点标红」这类跨字段联动在 reducer 内一次算完，无需 ref 镜像。
 *  - **渲染**：React Flow（@xyflow/react v12），分层坐标由纯函数 `computeLayeredLayout` 算出（可单测）。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { StreamFrame } from '../stream/eventTypes';
import { deriveStatuses, type DagNodeStatus } from '../stream/interpreters/dagInterpreter';
import { computeLayeredLayout } from '../stream/dagLayout';
import { dagReducer, INITIAL_DAG_STATE } from '../stream/dagStateMachine';

const NODE_W = 208;
const NODE_H = 64;

/** 主题（与项目现有深色面板一致） */
const STATUS_STYLE: Record<
  DagNodeStatus,
  { bg: string; border: string; text: string; badge: string; label: string }
> = {
  pending: { bg: '#1b1d21', border: '#33373d', text: '#9aa0a6', badge: '#6b7280', label: '等待' },
  active: { bg: '#3a2f14', border: '#f5a623', text: '#ffe0a3', badge: '#f5a623', label: '执行中' },
  done: { bg: '#12301f', border: '#2ecc71', text: '#b8f2cd', badge: '#2ecc71', label: '完成' },
  error: { bg: '#33181a', border: '#e74c3c', text: '#ffc9c2', badge: '#e74c3c', label: '异常' },
  skipped: { bg: '#1b1d21', border: '#444', text: '#777', badge: '#555', label: '跳过' },
};

/** 自定义节点 data —— 必须是 type 别名（interface 不满足 Record<string, unknown> 约束） */
type DagNodeData = {
  label: string;
  description?: string;
  status: DagNodeStatus;
};

type DagFlowNode = Node<DagNodeData, 'dagNode'>;

/** 单个 DAG 节点视图 */
function DagNodeView({ data, selected }: NodeProps<DagFlowNode>) {
  const s = STATUS_STYLE[data.status] ?? STATUS_STYLE.pending;
  return (
    <div
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        boxSizing: 'border-box',
        background: s.bg,
        border: `1.5px solid ${selected ? '#fff' : s.border}`,
        borderRadius: 9,
        padding: '9px 11px',
        color: s.text,
        boxShadow:
          data.status === 'active'
            ? '0 0 0 3px rgba(245,166,35,0.18), 0 2px 10px rgba(0,0,0,0.45)'
            : '0 2px 8px rgba(0,0,0,0.35)',
        transition: 'background 200ms, border-color 200ms',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: s.badge,
            flex: '0 0 auto',
            boxShadow: data.status === 'active' ? `0 0 6px ${s.badge}` : 'none',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{data.label}</span>
      </div>
      {data.description && (
        <div style={{ fontSize: 10.5, marginTop: 3, opacity: 0.78, lineHeight: 1.35 }}>
          {data.description}
        </div>
      )}
      <div
        style={{
          marginTop: 4,
          fontSize: 9.5,
          letterSpacing: 0.4,
          color: s.badge,
          textTransform: 'uppercase',
        }}
      >
        {s.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { dagNode: DagNodeView } as unknown as NodeTypes;

/* ------------------------------- 组件 ------------------------------- */

interface Props {
  /** 来自 useNexusStream 的帧广播订阅器 */
  subscribe: (handler: (frame: StreamFrame) => void) => () => void;
  isStreaming: boolean;
}

export function DagTopologyBoard({ subscribe, isStreaming }: Props) {
  const [state, dispatch] = useReducer(dagReducer, INITIAL_DAG_STATE);
  const { topology, activeStageId, errorStageId, errorMsg, focused } = state;

  const [nodes, setNodes, onNodesChange] = useNodesState<DagFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const flowRef = useRef<ReactFlowInstance<DagFlowNode, Edge> | null>(null);

  // 订阅原始帧 → dispatch 给 reducer（dispatch 稳定，effect 只订阅一次）
  useEffect(() => {
    const unsub = subscribe((frame) => dispatch({ type: 'frame', frame }));
    return unsub;
  }, [subscribe]);

  const statuses = useMemo(
    () => deriveStatuses(topology, activeStageId, errorStageId),
    [topology, activeStageId, errorStageId],
  );

  // 派生 React Flow 的 nodes / edges
  useEffect(() => {
    const { positions, width, height } = computeLayeredLayout(topology, {
      nodeWidth: NODE_W,
      nodeHeight: NODE_H,
    });

    setNodes(
      topology.nodes.map((n) => ({
        id: n.id,
        type: 'dagNode' as const,
        position: positions[n.id] ?? { x: 0, y: 0 },
        data: {
          label: n.label,
          description: n.description,
          status: statuses[n.id] ?? 'pending',
        },
        draggable: false,
        width: NODE_W,
        height: NODE_H,
      })),
    );

    setEdges(
      topology.edges.map((e) => {
        const src = statuses[e.source] ?? 'pending';
        const tgt = statuses[e.target] ?? 'pending';
        const live = src === 'done' || src === 'active';
        const broke = tgt === 'error';
        const color = broke ? '#e74c3c' : live ? '#2ecc71' : '#41464d';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: live && !broke,
          style: { stroke: color, strokeWidth: live || broke ? 2 : 1.4 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        } satisfies Edge;
      }),
    );

    // 拓扑替换（未来真 DAG）时重新适配视口
    if (width > 0 && height > 0) {
      const timer = window.setTimeout(() => {
        flowRef.current?.fitView({ padding: 0.16, duration: 220 });
      }, 30);
      return () => window.clearTimeout(timer);
    }
  }, [topology, statuses, setNodes, setEdges]);

  const handleNodeClick = useCallback((_: ReactMouseEvent, node: DagFlowNode) => {
    dispatch({ type: 'focus', label: node.data.label, description: node.data.description });
  }, []);

  const doneCount = topology.nodes.filter((n) => statuses[n.id] === 'done').length;
  const progress = topology.nodes.length
    ? Math.round((doneCount / topology.nodes.length) * 100)
    : 0;

  return (
    <div
      style={{
        border: '1px solid #2b2f35',
        borderRadius: 10,
        background: '#0f1114',
        padding: 12,
        color: '#e6e6e6',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 13.5 }}>执行 DAG 拓扑</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5 }}>
          <span style={{ color: '#8b9198' }}>
            {doneCount}/{topology.nodes.length} 节点
          </span>
          <span
            style={{
              color: errorMsg ? '#e74c3c' : isStreaming ? '#f5a623' : '#8b9198',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: errorMsg ? '#e74c3c' : isStreaming ? '#f5a623' : '#555',
              }}
            />
            {errorMsg ? '异常中断' : isStreaming ? '流式执行中' : '空闲'}
          </span>
        </div>
      </div>

      {/* 进度条 */}
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: '#21252a',
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: errorMsg ? '#e74c3c' : 'linear-gradient(90deg,#f5a623,#2ecc71)',
            transition: 'width 300ms ease',
          }}
        />
      </div>

      {/* 画布 */}
      <div style={{ height: 340, borderRadius: 8, overflow: 'hidden', background: '#0b0d10' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onInit={(inst) => {
            flowRef.current = inst;
          }}
          nodeTypes={nodeTypes}
          colorMode="dark"
          nodesConnectable={false}
          nodesDraggable={false}
          edgesFocusable={false}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.4}
          maxZoom={1.6}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#20242a" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            style={{ background: '#14171b' }}
            maskColor="rgba(0,0,0,0.55)"
            nodeColor={(n) => {
              const st = (n.data as DagNodeData | undefined)?.status ?? 'pending';
              return STATUS_STYLE[st].badge;
            }}
          />
        </ReactFlow>
      </div>

      {/* 底部：点击节点详情 / 图例 */}
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: '#8b9198',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span>
          {focused ? (
            <>
              <strong style={{ color: '#cfd4da' }}>{focused.label}</strong>
              {focused.description ? ` · ${focused.description}` : ''}
            </>
          ) : (
            '点击节点查看说明 · 可拖拽画布 / 滚轮缩放'
          )}
        </span>
        <span>
          {(Object.keys(STATUS_STYLE) as DagNodeStatus[])
            .filter((k) => k !== 'skipped')
            .map((k) => (
              <span key={k} style={{ marginLeft: 8, color: STATUS_STYLE[k].badge }}>
                ● {STATUS_STYLE[k].label}
              </span>
            ))}
        </span>
      </div>

      {errorMsg && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: '#ff8a80',
            background: 'rgba(231,76,60,0.1)',
            border: '1px solid rgba(231,76,60,0.35)',
            borderRadius: 6,
            padding: '6px 9px',
          }}
        >
          ⚠ {errorMsg}
        </div>
      )}
    </div>
  );
}

export default DagTopologyBoard;
