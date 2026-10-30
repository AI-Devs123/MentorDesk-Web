/**
 * 语法高亮配色与等宽字体常量（Slice 4）
 *
 * 从 MarkdownStream 抽出，供 MarkdownStream / CodeHighlight 等多处复用，
 * 避免同一套 One Dark 配色在多个文件里漂移。
 */
import type { TokenKind } from './highlight';

/** 高亮 token 配色（深色面板，沿用 One Dark 风格） */
export const TOKEN_COLOR: Record<TokenKind, string> = {
  plain: '#d6deeb',
  keyword: '#c792ea',
  string: '#a5d6a7',
  comment: '#6b7280',
  number: '#f78c6c',
};

/** 行内 / 块级代码统一排版字体 */
export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
