/**
 * DAG 看板状态机（Slice 2）
 *
 * 纯函数、零 React 依赖（放在 stream 层而非组件里，便于 node 环境单测）。
 * 把「一帧流式事件」折进看板状态：
 *  - 显式 `DAG_TOPOLOGY` 帧 → 整图替换（后端未来就绪即用，前端无需改）
 *  - 错误帧 → 把**当前激活节点**标红（reducer 内直接可见，不必用 ref 镜像激活值）
 *  - 阶段帧 → 推进激活节点；若回到首个节点，视为新一轮执行并整体重置
 */
import type { StreamFrame } from './eventTypes';
import {
  AGENT_FLOW_TOPOLOGY,
  interpretDagFrame,
  type DagTopology,
} from './interpreters/dagInterpreter';

export interface DagState {
  topology: DagTopology;
  activeStageId: string | null;
  errorStageId: string | null;
  errorMsg: string | null;
  focused: { label: string; description?: string } | null;
}

export const INITIAL_DAG_STATE: DagState = {
  topology: AGENT_FLOW_TOPOLOGY,
  activeStageId: null,
  errorStageId: null,
  errorMsg: null,
  focused: null,
};

export type DagAction =
  | { type: 'frame'; frame: StreamFrame }
  | { type: 'focus'; label: string; description?: string };

export function dagReducer(state: DagState, action: DagAction): DagState {
  if (action.type === 'focus') {
    return { ...state, focused: { label: action.label, description: action.description } };
  }

  const r = interpretDagFrame(action.frame);

  if (r.setTopology) {
    return {
      ...state,
      topology: r.setTopology,
      activeStageId: null,
      errorStageId: null,
      errorMsg: null,
    };
  }

  if (r.error) {
    // 当前激活节点标红；若尚无激活节点（如首帧就报错），交由 errorMsg 展示
    return { ...state, errorMsg: r.error, errorStageId: state.activeStageId };
  }

  if (r.setActiveStage) {
    const isFirstNode = state.topology.nodes[0]?.id === r.setActiveStage;
    const restarted = isFirstNode && (state.activeStageId !== null || state.errorMsg !== null);
    if (restarted) {
      // 新一轮执行：清空上一轮的完成/异常痕迹，保留（可能已被替换的）拓扑
      return {
        ...INITIAL_DAG_STATE,
        topology: state.topology,
        activeStageId: r.setActiveStage,
      };
    }
    return {
      ...state,
      activeStageId: r.setActiveStage,
      errorStageId: null,
      errorMsg: null,
      focused: null,
    };
  }

  return state;
}
