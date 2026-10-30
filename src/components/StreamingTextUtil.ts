/**
 * StreamingText 的纯逻辑工具（Slice 4）
 *
 * 抽到独立模块，使 StreamingText.tsx 只导出 React 组件（满足 react-refresh 要求），
 * 同时让单测能不依赖组件直接覆盖这段纯逻辑。
 */

/** 超过该长度视为长文，自动降级为整段直出（避免高频 re-render） */
export const AUTO_TYPE_MAX_LEN = 3000;

/**
 * 纯函数：是否启用打字动画。
 * 显式关闭 或 文本超长 时返回 false（降级为整段显示）。
 */
export function resolveTyping(
  text: string,
  typing: boolean,
  maxLen: number = AUTO_TYPE_MAX_LEN,
): boolean {
  return typing && text.length <= maxLen;
}
