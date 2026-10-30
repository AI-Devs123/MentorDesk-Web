/**
 * Markdown 流式渲染器（Slice 3）
 *
 * 职责：把「流式累积的文本」渲染成 Markdown，并可选带打字机动画。
 *
 * 安全口径（与后端 SecurityGuard 对齐，重要）：
 *  - **不启用 rehype-raw**：Markdown 里的裸 HTML 一律不渲染，只当文本展示。
 *    策展正文是从网页提纯来的，属于不可信输入，绝不能让它注入 DOM。
 *  - **URL 做协议白名单**：拒绝 javascript: / data: / vbscript: 等伪协议链接，
 *    只放行 http(s) / mailto 与相对路径，防止点击型 XSS。
 *
 * 渲染样式用内联 style 而非 Tailwind 类：本组件的输入是不可信 Markdown，
 * 不套用全局排版（无 @tailwindcss/typography），避免宿主样式被内容影响。
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useTypewriter } from '../hooks/useTypewriter';
import { highlightCode, type TokenKind } from '../markdown/highlight';

/** 高亮 token 配色（深色面板，沿用 One Dark 风格） */
const TOKEN_COLOR: Record<TokenKind, string> = {
  plain: '#d6deeb',
  keyword: '#c792ea',
  string: '#a5d6a7',
  comment: '#6b7280',
  number: '#f78c6c',
};

/** 行内/块级代码与标题等元素的统一排版常量 */
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface Props {
  /** 待渲染的完整文本（流式过程中会是累积的中间态） */
  text: string;
  /** 是否启用打字机动画，默认开启 */
  typing?: boolean;
  /** 打字速度（字符/秒） */
  cps?: number;
  /** 空文本时的占位提示 */
  emptyHint?: string;
}

/**
 * 代码块 / 行内代码渲染。
 * 带 language-xxx 或含换行的按代码块处理，走极简高亮；其余按行内代码处理。
 */
function CodeView({ className, children }: { className?: string; children?: ReactNode }) {
  const raw = String(children ?? '').replace(/\n$/, '');
  const lang = /language-([\w-]+)/.exec(className ?? '')?.[1] ?? null;
  const tokens = useMemo(() => highlightCode(raw, lang), [raw, lang]);
  const isBlock = Boolean(lang) || raw.includes('\n');

  if (!isBlock) {
    return (
      <code
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12.5,
          background: '#1b1f24',
          border: '1px solid #2b3138',
          borderRadius: 4,
          padding: '1px 5px',
          color: '#a5d6a7',
        }}
      >
        {raw}
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
        fontSize: 12.5,
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

/**
 * 只放行安全协议：http(s) / mailto / 相对路径。
 * 其余（javascript: / data: / vbscript:）降级为 #，杜绝点击型 XSS。
 */
function safeUrlTransform(url: string): string {
  const lowered = url.trim().toLowerCase();
  const blocked = ['javascript:', 'data:', 'vbscript:', 'file:'];
  if (blocked.some((p) => lowered.startsWith(p))) return '#';
  return defaultUrlTransform(url);
}

/** Markdown 元素 → 内联样式映射（不依赖全局 CSS） */
const components: Components = {
  h1: ({ children }) => (
    <h1 style={{ fontSize: 19, fontWeight: 500, margin: '16px 0 8px', lineHeight: 1.4 }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: 16.5, fontWeight: 500, margin: '14px 0 7px', lineHeight: 1.4 }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: 14.5, fontWeight: 500, margin: '12px 0 6px', lineHeight: 1.4 }}>
      {children}
    </h3>
  ),
  p: ({ children }) => <p style={{ margin: '8px 0', lineHeight: 1.75 }}>{children}</p>,
  ul: ({ children }) => (
    <ul style={{ margin: '8px 0', paddingLeft: 22, listStyle: 'disc' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: '8px 0', paddingLeft: 22, listStyle: 'decimal' }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ margin: '3px 0', lineHeight: 1.7 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 500, color: '#fff' }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: 'italic', opacity: 0.9 }}>{children}</em>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: '10px 0',
        padding: '2px 0 2px 12px',
        borderLeft: '3px solid #3d4550',
        color: '#9aa4b2',
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr style={{ border: 0, borderTop: '1px solid #2b3138', margin: '14px 0' }} />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      style={{ color: '#7fb3ff', textDecoration: 'underline' }}
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '10px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th
      style={{
        border: '1px solid #2b3138',
        background: '#1b1f24',
        padding: '6px 9px',
        textAlign: 'left',
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: '1px solid #2b3138', padding: '6px 9px', verticalAlign: 'top' }}>
      {children}
    </td>
  ),
  code: CodeView,
  pre: ({ children }) => <>{children}</>,
};

export function MarkdownStream({ text, typing = true, cps, emptyHint }: Props) {
  const { text: shown, isTyping, skip } = useTypewriter(text, { enabled: typing, cps });

  // 打字过程中点击任意处即跳过动画（常见的阅读体验优化）
  const handleClick = useCallback(() => {
    if (isTyping) skip();
  }, [isTyping, skip]);

  if (!text) {
    return (
      <div style={{ color: '#6b7280', fontSize: 12.5, padding: '8px 0' }}>
        {emptyHint ?? '暂无内容'}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      style={{
        color: '#d6deeb',
        fontSize: 13.5,
        lineHeight: 1.7,
        wordBreak: 'break-word',
        cursor: isTyping ? 'pointer' : 'default',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrlTransform}
        components={components}
        // 不启用 rehype-raw：裸 HTML 一律不渲染，防不可信正文注入 DOM
        skipHtml
      >
        {shown}
      </ReactMarkdown>
      {isTyping && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 7,
            height: 14,
            marginLeft: 2,
            background: '#7fb3ff',
            verticalAlign: 'text-bottom',
          }}
        />
      )}
    </div>
  );
}

export default MarkdownStream;
