/**
 * 打字机推进算法（Slice 3）
 *
 * 纯函数、零 React / 零 DOM 依赖，便于在 node 环境单测。
 * 职责：给定「上一帧已显示字符数 + 目标文本长度 + 经过时间」，算出这一帧应显示到第几个字符。
 *
 * 设计要点：
 *  - **单调推进**：目标不缩短时只增不减，避免文本抖动；
 *  - **目标缩短即对齐**：新一轮执行会把 text 换成更短的内容（或清空），此时直接对齐到新长度，
 *    不做逐字回退——回退在视觉上无意义，且会与 React 的 key 复用打架；
 *  - **先乘后取整**：用累计毫秒而非每帧增量，避免低频帧下推进速度被取整误差拖慢；
 *  - **cps <= 0 视为不限速**：直接全量显示（用于 skip / prefers-reduced-motion）。
 */

/** 默认打字速度：字符/秒 */
export const DEFAULT_CPS = 90;

/**
 * 把任意输入收敛为安全的非负整数（防御 NaN / 负 / 小数）。
 */
function toSafeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * 计算下一帧应显示的字符数。
 *
 * @param prev      上一帧已显示的字符数
 * @param target    目标文本的总字符数
 * @param elapsedMs 自上一帧起经过的毫秒数
 * @param cps       每秒推进字符数；<= 0 表示不限速（立即全显）
 */
export function nextVisible(
  prev: number,
  target: number,
  elapsedMs: number,
  cps: number = DEFAULT_CPS,
): number {
  const safePrev = toSafeInt(prev);
  const safeTarget = toSafeInt(target);
  const safeElapsed = toSafeInt(elapsedMs);

  // 目标被替换成更短的文本（新一轮 / 重置）：直接对齐，不逐字回退
  if (safeTarget <= safePrev) return safeTarget;

  // 不限速（skip、降低动效偏好）
  if (!Number.isFinite(cps) || cps <= 0) return safeTarget;

  const advance = Math.floor((safeElapsed / 1000) * cps);
  // 至少推进 1 个字符：避免极短帧（<11ms @90cps）算出 0 而卡住不动
  const stepped = safePrev + Math.max(1, advance);

  return Math.min(safeTarget, stepped);
}

/** 是否已显示完整 */
export function isComplete(visible: number, target: number): boolean {
  return toSafeInt(visible) >= toSafeInt(target);
}

/**
 * 按已显示字符数截取文本。
 * 超出范围会被安全夹紧，调用方无需再做边界判断。
 */
export function sliceVisible(text: string, visible: number): string {
  const len = text.length;
  const safeVisible = Math.min(len, toSafeInt(visible));
  return text.slice(0, safeVisible);
}

/**
 * 补齐未闭合的代码围栏。
 *
 * 打字机是逐字符推进的，中途必然出现「``` 已打出、 closing fence 还没到」的中间态；
 * 若直接交给 Markdown 解析器，这段会被当成普通段落渲染，等围栏闭合后再整块跳变成代码块——
 * 视觉上是明显的闪烁。这里在截断处补一个收尾围栏，让代码块从出现的第一帧起就是代码块。
 */
export function closeUnterminatedFence(text: string): string {
  if (!text) return text;
  // 统计独立成行的 ``` / ~~~ 围栏数量（行首允许最多 3 个空格缩进，符合 CommonMark）
  const fences = text.split('\n').filter((line) => /^\s{0,3}(```|~~~)/.test(line)).length;
  if (fences % 2 === 0) return text;
  return text.endsWith('\n') ? `${text}\`\`\`` : `${text}\n\`\`\``;
}

/* ----------------------------- 状态机（可单测） ----------------------------- */

/**
 * 打字机状态。
 * `base` 保存上一帧的完整文本，用于判断这一帧是「追加」还是「被替换」（新一轮）。
 */
export interface TypewriterState {
  visible: number;
  base: string;
}

export type TypewriterAction =
  /** 目标文本变化：追加则延续进度，替换则从头开始打 */
  | { type: 'text'; text: string; enabled: boolean }
  /** 每帧推进 */
  | { type: 'tick'; elapsedMs: number; cps: number; target: number }
  /** 跳过动画，立即全显 */
  | { type: 'skip'; target: number }
  /** 重置到起点 */
  | { type: 'reset' };

export const INITIAL_TYPEWRITER_STATE: TypewriterState = { visible: 0, base: '' };

/**
 * 纯 reducer：把「文本变化 / 每帧推进 / 跳过 / 重置」折进打字机状态。
 *
 * 放在这里（而非组件内）是为了能在 node 环境单测，同时让 hook 侧不必用 ref 镜像状态
 * （ref 在 render 期写入会被 react-hooks 规则拦截）。
 */
export function typewriterReducer(
  state: TypewriterState,
  action: TypewriterAction,
): TypewriterState {
  switch (action.type) {
    case 'text': {
      // 引用未变：直接返回原对象，避免无意义重渲染
      if (action.text === state.base) return state;

      // 追加（流式吐字）→ 延续进度；被替换或缩短（新一轮）→ 从头打
      const isAppend = action.text.length > state.base.length
        && action.text.startsWith(state.base);
      const visible = isAppend ? state.visible : 0;

      // 关闭动画时直接对齐到全文
      return { base: action.text, visible: action.enabled ? visible : action.text.length };
    }

    case 'tick': {
      if (state.visible >= action.target) return state;
      const next = nextVisible(state.visible, action.target, action.elapsedMs, action.cps);
      return next === state.visible ? state : { ...state, visible: next };
    }

    case 'skip': {
      if (state.visible >= action.target) return state;
      return { ...state, visible: action.target };
    }

    case 'reset':
      return { ...state, visible: 0 };

    default:
      return state;
  }
}
