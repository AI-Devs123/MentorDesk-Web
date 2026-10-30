/**
 * 打字机 Hook（Slice 3）
 *
 * 把「文本流」变成「逐字显示」的动画。状态收敛在纯 reducer（见 markdown/typewriter.ts），
 * 因此 hook 侧不需要用 ref 镜像进度（render 期写 ref 会被 react-hooks 规则拦截），
 * 也不需要在 effect 里同步 setState（会触发级联渲染）。
 *
 * 推进策略：每轮 effect 只调度**一帧** rAF，帧回调里 dispatch 推进 → 触发下一轮 effect，
 * 直到追平目标长度。好处是暂停 / 卸载 / 参数变化都能天然被 cleanup 收敛。
 */
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  INITIAL_TYPEWRITER_STATE,
  closeUnterminatedFence,
  sliceVisible,
  typewriterReducer,
  DEFAULT_CPS,
} from '../markdown/typewriter';

export interface UseTypewriterOptions {
  /** 每秒推进字符数，默认 90；<= 0 表示不限速 */
  cps?: number;
  /** 是否启用打字动画；false 时始终全文直出 */
  enabled?: boolean;
}

export interface TypewriterApi {
  /** 当前应渲染的文本（已做围栏补全，代码块不会中途跳变） */
  text: string;
  /** 是否仍在打字 */
  isTyping: boolean;
  /** 跳过动画，立即显示全文 */
  skip: () => void;
  /** 重新从零开始打 */
  restart: () => void;
}

/** 读取系统「减少动效」偏好；不支持 matchMedia 时按「不减少」处理 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useTypewriter(source: string, options: UseTypewriterOptions = {}): TypewriterApi {
  const { cps = DEFAULT_CPS, enabled: enabledProp = true } = options;

  // 尊重系统降低动效偏好：一旦开启减少动效，直接全文直出（无障碍要求）
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const enabled = enabledProp && !reducedMotion;

  const [state, dispatch] = useReducer(typewriterReducer, INITIAL_TYPEWRITER_STATE);

  // 目标文本变化：追加则延续进度，替换则从头开始
  useEffect(() => {
    dispatch({ type: 'text', text: source, enabled });
  }, [source, enabled]);

  // 每帧只调度一次 rAF；追平后停止调度
  useEffect(() => {
    if (!enabled) return;
    if (state.visible >= source.length) return;

    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now: number) {
      const elapsed = now - last;
      last = now;
      dispatch({ type: 'tick', elapsedMs: elapsed, cps, target: source.length });
      raf = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(raf);
  }, [enabled, state.visible, source, cps]);

  const skip = useCallback(() => {
    dispatch({ type: 'skip', target: source.length });
  }, [source]);

  const restart = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  const shown = enabled ? sliceVisible(source, state.visible) : source;

  return {
    // 打字中途补齐未闭合围栏，避免代码块先渲染成段落再整块跳变
    text: enabled ? closeUnterminatedFence(shown) : source,
    isTyping: enabled && state.visible < source.length,
    skip,
    restart,
  };
}
