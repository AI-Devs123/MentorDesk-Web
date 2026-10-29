/**
 * DAG 分层布局（Slice 2）
 *
 * 纯函数、零 React / 零 @xyflow 依赖，便于在 node 环境单测。
 * 职责：把 {nodes, edges} 拓扑计算成每个节点的 (x, y) 坐标 + 画布尺寸。
 *
 * 布局方向：**深度（依赖层）向下，同层横向并排**。
 *  - 用 DFS 三色标记剔除回边，保证进入分层算法的是真正的 DAG（后端若因脏数据给出环，
 *    也不会死循环或整张图塌成一层）；
 *  - 剔除回边后用 Kahn 拓扑序求「最长路径深度」，保证连线总是指向更深层；
 *  - 同层节点水平排列并整体居中，避免子节点偏左。
 *
 * 之所以自己算而不是引 dagre/elkjs：当前拓扑是 5 节点顺序链，未来后端给真 DAG 也多为
 * 浅层分支；一个百行内的确定性布局足够，且不额外增加依赖与体积。
 */
import type { DagTopology } from './interpreters/dagInterpreter';

export interface DagLayoutOptions {
  /** 节点宽度，默认 200 */
  nodeWidth?: number;
  /** 节点高度，默认 62 */
  nodeHeight?: number;
  /** 同层节点的水平间距，默认 48 */
  gapX?: number;
  /** 相邻层之间的垂直间距，默认 56 */
  gapY?: number;
}

export interface DagPoint {
  x: number;
  y: number;
}

export interface DagLayoutResult {
  positions: Record<string, DagPoint>;
  /** 画布内容宽度（用于 fitView / 容器尺寸参考） */
  width: number;
  /** 画布内容高度 */
  height: number;
  /** 拓扑最大深度层数（含第 0 层） */
  layers: number;
}

const DEFAULTS: Required<DagLayoutOptions> = {
  nodeWidth: 200,
  nodeHeight: 62,
  gapX: 48,
  gapY: 56,
};

type Color = 'white' | 'gray' | 'black';

/**
 * DFS 三色标记找出回边（gray → gray 即指向当前递归栈上的祖先）。
 * 返回 `source>target` 形式的回边键集合，迭代实现避免深图爆栈。
 */
function findBackEdges(ids: string[], succs: Record<string, string[]>): Set<string> {
  const color = new Map<string, Color>(ids.map((id) => [id, 'white']));
  const back = new Set<string>();

  ids.forEach((root) => {
    if (color.get(root) !== 'white') return;
    color.set(root, 'gray');
    const stack: { id: string; cursor: number }[] = [{ id: root, cursor: 0 }];

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const children = succs[top.id] ?? [];
      if (top.cursor < children.length) {
        const v = children[top.cursor];
        top.cursor += 1;
        const c = color.get(v);
        if (c === 'gray') {
          back.add(`${top.id}>${v}`); // 指向栈上祖先 → 回边
        } else if (c === 'white') {
          color.set(v, 'gray');
          stack.push({ id: v, cursor: 0 });
        }
      } else {
        color.set(top.id, 'black');
        stack.pop();
      }
    }
  });

  return back;
}

/**
 * 计算每个节点的分层深度。
 * 前处理：丢弃两端不存在的边与自环，再用 DFS 剔除回边；随后 Kahn + 最长路径分层。
 * 兜底：任何未处理节点（理论上不应存在）深度保持 0，保证函数恒有返回值。
 */
export function computeDepths(topology: DagTopology): Record<string, number> {
  const ids = topology.nodes.map((n) => n.id);
  const known = new Set(ids);
  const depth: Record<string, number> = {};
  const succs: Record<string, string[]> = {};

  ids.forEach((id) => {
    depth[id] = 0;
    succs[id] = [];
  });

  // 只收两端都存在的边（容错：后端可能先给节点后补边，或给出已删节点的残留边）
  topology.edges.forEach((e) => {
    if (!known.has(e.source) || !known.has(e.target) || e.source === e.target) return;
    succs[e.source].push(e.target);
  });

  const back = findBackEdges(ids, succs);

  const indegree: Record<string, number> = {};
  ids.forEach((id) => {
    indegree[id] = 0;
  });
  ids.forEach((u) => {
    succs[u] = succs[u].filter((v) => {
      if (back.has(`${u}>${v}`)) return false;
      indegree[v] += 1;
      return true;
    });
  });

  const queue = ids.filter((id) => indegree[id] === 0);
  let cursor = 0;
  while (cursor < queue.length) {
    const u = queue[cursor++];
    succs[u].forEach((v) => {
      if (depth[v] < depth[u] + 1) depth[v] = depth[u] + 1;
      indegree[v] -= 1;
      if (indegree[v] === 0) queue.push(v);
    });
  }

  return depth;
}

/**
 * 由拓扑算出节点坐标。
 * 同层节点按其在 nodes[] 中的原始顺序从左到右排列，并相对最宽层居中。
 */
export function computeLayeredLayout(
  topology: DagTopology,
  options: DagLayoutOptions = {},
): DagLayoutResult {
  const { nodeWidth, nodeHeight, gapX, gapY } = { ...DEFAULTS, ...options };
  const positions: Record<string, DagPoint> = {};

  if (topology.nodes.length === 0) {
    return { positions, width: 0, height: 0, layers: 0 };
  }

  const depth = computeDepths(topology);

  // 按层分组，保持原始顺序
  const byLayer: string[][] = [];
  topology.nodes.forEach((n) => {
    const d = depth[n.id] ?? 0;
    if (!byLayer[d]) byLayer[d] = [];
    byLayer[d].push(n.id);
  });

  // 压缩空洞层（防御：深度不连续时不产生空白层）
  const layers = byLayer.filter(Boolean);

  const maxPerLayer = layers.reduce((m, l) => Math.max(m, l.length), 0);
  const contentWidth = maxPerLayer * nodeWidth + Math.max(0, maxPerLayer - 1) * gapX;
  const contentHeight = layers.length * nodeHeight + Math.max(0, layers.length - 1) * gapY;

  layers.forEach((layerNodes, layerIdx) => {
    const rowWidth = layerNodes.length * nodeWidth + Math.max(0, layerNodes.length - 1) * gapX;
    const offsetX = (contentWidth - rowWidth) / 2;
    layerNodes.forEach((id, i) => {
      positions[id] = {
        x: offsetX + i * (nodeWidth + gapX),
        y: layerIdx * (nodeHeight + gapY),
      };
    });
  });

  return { positions, width: contentWidth, height: contentHeight, layers: layers.length };
}
