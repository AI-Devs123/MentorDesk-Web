/**
 * 轻量代码高亮渲染（Slice 4 · 4-B）
 *
 * 复用 Slice 3 的零依赖 `highlightCode` 扫描器，把 token 序列渲染成带配色的
 * <span>。支持两种形态：
 *  - block=false（默认）：行内 <code>，用于代码符号签名等单行片段；
 *  - block=true：带背景/横向滚动的 <pre>，用于多行代码块。
 *
 * 配色与字体统一来自 markdown/highlightColors，与 MarkdownStream 保持一致。
 */
import { useMemo } from 'react';
import { highlightCode } from '../markdown/highlight';
import { TOKEN_COLOR, FONT_MONO } from '../markdown/highlightColors';

interface Props {
  /** 待高亮的代码文本 */
  code: string;
  /** 语言标记（java/python/ts/...），未知语言降级纯文本 */
  lang?: string | null;
  /** 是否按代码块渲染（带背景/滚动）；false 为行内 */
  block?: boolean;
  /** 行内模式字号（默认 12.5） */
  fontSize?: number;
  /** 附加到根元素的 className（行内模式常用，例如 font-mono break-all） */
  className?: string;
}

export function CodeHighlight({ code, lang, block = false, fontSize = 12.5, className }: Props) {
  const tokens = useMemo(() => highlightCode(code, lang), [code, lang]);

  if (!block) {
    return (
      <code
        className={className}
        style={{
          fontFamily: FONT_MONO,
          fontSize,
          color: TOKEN_COLOR.plain,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {tokens.map((t, i) => (
          <span key={i} style={{ color: TOKEN_COLOR[t.kind] }}>
            {t.text}
          </span>
        ))}
      </code>
    );
  }

  return (
    <pre
      style={{
        background: '#12161b',
        border: '1px solid #2b3138',
        borderRadius: 8,
        padding: '10px 12px',
        overflowX: 'auto',
        fontFamily: FONT_MONO,
        fontSize,
        lineHeight: 1.55,
        margin: '10px 0',
      }}
    >
      <code>
        {tokens.map((t, i) => (
          <span key={i} style={{ color: TOKEN_COLOR[t.kind] }}>
            {t.text}
          </span>
        ))}
      </code>
    </pre>
  );
}

export default CodeHighlight;
