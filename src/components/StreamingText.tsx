/**
 * 通用流式文本组件（Slice 4 · 4-A）
 *
 * 把 Slice 3 建好的「打字机 + Markdown 渲染」基建收敛成一个可复用组件，
 * 让渐进显示能力能落到任何面板，而不是只服务 WebCurate。
 *
 * 两种模式：
 *  - as="markdown"（默认）：委托 MarkdownStream，正文按 Markdown 渲染并可选打字机；
 *  - as="text"：纯文本打字机（带点击跳过 + 闪烁光标）。
 *
 * 安全 / 体验细节：
 *  - 尊重系统「减少动效」偏好（useTypewriter 内已处理）；
 *  - 超长文本（>AUTO_TYPE_MAX_LEN）自动关闭打字动画，避免长文 re-render 抖动；
 *  - 不引入新依赖，纯 React + Slice 3 既有模块。
 */
import React, { useCallback } from 'react';
import { useTypewriter } from '../hooks/useTypewriter';
import { MarkdownStream } from './MarkdownStream';
import { resolveTyping } from './StreamingTextUtil';

interface Props {
  /** 待显示的完整文本（流式过程中为累积中间态） */
  text: string;
  /** 渲染模式：markdown 走 MarkdownStream，text 走纯文本打字机 */
  as?: 'text' | 'markdown';
  /** 是否启用打字机（超长文本会被自动降级） */
  typing?: boolean;
  /** 打字速度（字符/秒） */
  cps?: number;
  /** 附加到根元素的 className */
  className?: string;
  /** 空文本时的占位提示 */
  emptyHint?: string;
}

export function StreamingText({
  text,
  as = 'markdown',
  typing = true,
  cps,
  className,
  emptyHint,
}: Props) {
  const effectiveTyping = resolveTyping(text, typing);

  if (!text) {
    return (
      <span style={{ color: '#6b7280', fontSize: 12.5 }} className={className}>
        {emptyHint ?? '暂无内容'}
      </span>
    );
  }

  if (as === 'markdown') {
    return (
      <MarkdownStream text={text} typing={effectiveTyping} cps={cps} emptyHint={emptyHint} />
    );
  }

  return (
    <PlainStreamingText text={text} typing={effectiveTyping} cps={cps} className={className} />
  );
}

interface PlainProps {
  text: string;
  typing: boolean;
  cps?: number;
  className?: string;
}

/** 纯文本打字机：逐字显示 + 点击跳过 + 闪烁光标 */
function PlainStreamingText({ text, typing, cps, className }: PlainProps) {
  const { text: shown, isTyping, skip } = useTypewriter(text, { enabled: typing, cps });
  const handleClick = useCallback(() => {
    if (isTyping) skip();
  }, [isTyping, skip]);

  return (
    <span
      onClick={handleClick}
      className={className}
      style={{ cursor: isTyping ? 'pointer' : 'default', wordBreak: 'break-word' }}
    >
      {shown}
      {isTyping && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 7,
            height: 14,
            marginLeft: 2,
            background: 'currentColor',
            opacity: 0.6,
            verticalAlign: 'text-bottom',
          }}
        />
      )}
    </span>
  );
}

export default StreamingText;
