import { describe, expect, it } from 'vitest';
import {
  AGENT_FLOW_TOPOLOGY,
  type DagTopology,
} from './interpreters/dagInterpreter';
import { computeDepths, computeLayeredLayout } from './dagLayout';

function topo(nodes: string[], edges: [string, string][]): DagTopology {
  return {
    nodes: nodes.map((id) => ({ id, label: id })),
    edges: edges.map(([source, target], i) => ({ id: `e${i}`, source, target })),
  };
}

describe('computeDepths', () => {
  it('顺序链深度逐层递增', () => {
    const d = computeDepths(AGENT_FLOW_TOPOLOGY);
    expect(d.SECURITY_GUARD_SCAN).toBe(0);
    expect(d.DAG_ORCHESTRATION).toBe(1);
    expect(d.WORKER_DISPATCH).toBe(2);
    expect(d.RAG_RETRIEVAL).toBe(3);
    expect(d.TASK_COMPLETED).toBe(4);
  });

  it('菱形依赖按最长路径分层（汇点深度取最大）', () => {
    // A -> B -> D, A -> C -> E -> D
    const d = computeDepths(
      topo(['A', 'B', 'C', 'D', 'E'], [
        ['A', 'B'],
        ['A', 'C'],
        ['B', 'D'],
        ['C', 'E'],
        ['E', 'D'],
      ]),
    );
    expect(d.A).toBe(0);
    expect(d.B).toBe(1);
    expect(d.C).toBe(1);
    expect(d.E).toBe(2);
    expect(d.D).toBe(3); // 取最长路径 A->C->E->D
  });

  it('容错：指向不存在节点的边、自环都被忽略', () => {
    const d = computeDepths(
      topo(['A', 'B'], [
        ['A', 'GHOST'],
        ['B', 'B'],
        ['A', 'B'],
      ]),
    );
    expect(d.A).toBe(0);
    expect(d.B).toBe(1);
  });

  it('容错：存在环时不死循环，剔除回边后仍能正常分层', () => {
    const d = computeDepths(
      topo(['A', 'B', 'C'], [
        ['A', 'B'],
        ['B', 'A'], // 回边：应被 DFS 三色标记剔除
        ['B', 'C'],
      ]),
    );
    expect(d.A).toBe(0);
    expect(d.B).toBe(1);
    expect(d.C).toBe(2); // 环下游仍能拿到正确深度
  });
});

describe('computeLayeredLayout', () => {
  it('顺序链：5 个节点同列、纵向等距、画布宽度等于单节点宽度', () => {
    const { positions, width, height, layers } = computeLayeredLayout(AGENT_FLOW_TOPOLOGY, {
      nodeWidth: 200,
      nodeHeight: 60,
      gapX: 40,
      gapY: 50,
    });

    expect(layers).toBe(5);
    expect(width).toBe(200);
    expect(height).toBe(5 * 60 + 4 * 50);

    const xs = Object.values(positions).map((p) => p.x);
    expect(new Set(xs).size).toBe(1); // 全部同列

    expect(positions.SECURITY_GUARD_SCAN.y).toBe(0);
    expect(positions.DAG_ORCHESTRATION.y).toBe(110);
    expect(positions.TASK_COMPLETED.y).toBe(440);
  });

  it('分支拓扑：同层两个节点并排且整体居中于最宽层', () => {
    const { positions, width, height } = computeLayeredLayout(
      topo(['A', 'B', 'C', 'D'], [
        ['A', 'B'],
        ['A', 'C'],
        ['B', 'D'],
        ['C', 'D'],
      ]),
      { nodeWidth: 200, nodeHeight: 60, gapX: 40, gapY: 50 },
    );

    expect(width).toBe(200 * 2 + 40);
    expect(height).toBe(60 * 3 + 50 * 2);

    // A 与 D 单独成层 → 居中对齐
    expect(positions.A.x).toBe((440 - 200) / 2);
    expect(positions.D.x).toBe((440 - 200) / 2);
    // B、C 并排
    expect(positions.B.y).toBe(positions.C.y);
    expect(Math.abs(positions.B.x - positions.C.x)).toBe(240);
  });

  it('空拓扑返回零尺寸', () => {
    expect(computeLayeredLayout({ nodes: [], edges: [] })).toEqual({
      positions: {},
      width: 0,
      height: 0,
      layers: 0,
    });
  });

  it('孤立节点（无边）全部落在第 0 层并横向排列', () => {
    const { positions, layers, width } = computeLayeredLayout(topo(['X', 'Y', 'Z'], []), {
      nodeWidth: 100,
      gapX: 10,
    });
    expect(layers).toBe(1);
    expect(width).toBe(100 * 3 + 10 * 2);
    expect(positions.X.y).toBe(0);
    expect(positions.Y.y).toBe(0);
    expect(positions.Z.y).toBe(0);
    expect(positions.X.x).toBe(0);
    expect(positions.Z.x).toBe(220);
  });
});
