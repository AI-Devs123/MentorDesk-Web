/**
 * 极简代码高亮（Slice 3）
 *
 * 纯函数、零依赖（刻意不引 highlight.js / Shiki —— 项目 bundle 已 515KB，
 * 且本项目只需要覆盖 agent 输出里常见的几种语言）。
 *
 * 实现是一个**单遍字符扫描器**，按「注释 → 字符串 → 数字 → 标识符」的优先级切分，
 * 因此注释和字符串里的关键字不会被误着色（这是正则方案最常见的 bug）。
 *
 * 覆盖范围：java / python / typescript / javascript / bash / sql / json。
 * 未识别的语言原样返回单个 plain token，由渲染层直接输出纯文本（绝不猜）。
 */
export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number';

export interface HighlightToken {
  text: string;
  kind: TokenKind;
}

type LangKey = 'java' | 'python' | 'typescript' | 'javascript' | 'bash' | 'sql' | 'json';

const KEYWORDS: Record<LangKey, Set<string>> = {
  java: new Set([
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
    'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final',
    'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int',
    'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public',
    'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
    'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'var', 'record',
    'true', 'false', 'null',
  ]),
  python: new Set([
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
    'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
    'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
    'with', 'yield', 'True', 'False', 'None', 'self',
  ]),
  typescript: new Set([
    'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const',
    'continue', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
    'finally', 'for', 'from', 'function', 'if', 'implements', 'import', 'in',
    'instanceof', 'interface', 'let', 'new', 'null', 'of', 'private', 'protected',
    'public', 'readonly', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',
    'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'yield',
  ]),
  javascript: new Set([
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
    'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function',
    'if', 'import', 'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'super',
    'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void',
    'while', 'yield',
  ]),
  bash: new Set([
    'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case',
    'esac', 'function', 'return', 'exit', 'export', 'local', 'echo', 'cd', 'set',
    'source', 'sudo', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep',
  ]),
  sql: new Set([
    'select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set', 'delete',
    'create', 'table', 'alter', 'drop', 'index', 'join', 'left', 'right', 'inner',
    'outer', 'on', 'group', 'by', 'order', 'having', 'limit', 'offset', 'as', 'and',
    'or', 'not', 'null', 'distinct', 'union', 'with', 'primary', 'key', 'foreign',
    'references', 'default', 'unique', 'check',
  ]),
  json: new Set(['true', 'false', 'null']),
};

/** 行注释前缀；无行注释的语言不列（如 json） */
const LINE_COMMENT: Partial<Record<LangKey, string>> = {
  java: '//',
  typescript: '//',
  javascript: '//',
  python: '#',
  bash: '#',
  sql: '--',
};

/** 支持 /* *\/ 块注释的语言 */
const BLOCK_COMMENT_LANGS: Set<LangKey> = new Set<LangKey>(['java', 'typescript', 'javascript']);

/** 代码块语言标记归一化：```java / ```js / ```ts / ```py 等 → 内部语言键 */
const LANG_ALIASES: Record<string, LangKey> = {
  java: 'java',
  python: 'python',
  py: 'python',
  python3: 'python',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  sql: 'sql',
  mysql: 'sql',
  json: 'json',
  jsonc: 'json',
};

/**
 * 把 Markdown 代码围栏的语言标记归一化；无法识别返回 null（渲染层应退回纯文本）。
 */
export function normalizeLang(lang?: string | null): LangKey | null {
  if (!lang) return null;
  const key = lang.trim().toLowerCase();
  return LANG_ALIASES[key] ?? null;
}

const QUOTES = new Set(['"', "'", '`']);
const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * 追加 token；与前一个 token 同类型时合并，减少 React 渲染节点数。
 */
function pushToken(tokens: HighlightToken[], text: string, kind: TokenKind): void {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
    return;
  }
  tokens.push({ text, kind });
}

/**
 * 把代码切分为高亮 token 序列。
 * 未知语言 / 空串时返回单个 plain token（或空数组），调用方可安全直接渲染。
 */
export function highlightCode(code: string, lang?: string | null): HighlightToken[] {
  if (!code) return [];

  const key = normalizeLang(lang);
  if (!key) return [{ text: code, kind: 'plain' }];

  const keywords = KEYWORDS[key];
  const lineComment = LINE_COMMENT[key] ?? null;
  const supportsBlockComment = BLOCK_COMMENT_LANGS.has(key);

  const tokens: HighlightToken[] = [];
  const len = code.length;
  let i = 0;

  while (i < len) {
    const ch = code[i];

    // 1) 块注释 /* ... */
    if (supportsBlockComment && ch === '/' && code[i + 1] === '*') {
      let end = i + 2;
      while (end < len && !(code[end] === '*' && code[end + 1] === '/')) end += 1;
      end = Math.min(len, end + 2);
      pushToken(tokens, code.slice(i, end), 'comment');
      i = end;
      continue;
    }

    // 2) 行注释：到行尾为止
    if (lineComment && code.startsWith(lineComment, i)) {
      let end = code.indexOf('\n', i);
      if (end === -1) end = len;
      pushToken(tokens, code.slice(i, end), 'comment');
      i = end;
      continue;
    }

    // 3) 字符串：支持反斜杠转义，未闭合时吃到行尾（不吞噬后续代码）
    if (QUOTES.has(ch)) {
      let end = i + 1;
      while (end < len) {
        const c = code[end];
        if (c === '\\') {
          end += 2;
          continue;
        }
        if (c === ch) {
          end += 1;
          break;
        }
        if (c === '\n') break; // 未闭合，止于行尾
        end += 1;
      }
      pushToken(tokens, code.slice(i, Math.min(end, len)), 'string');
      i = Math.min(end, len);
      continue;
    }

    // 4) 数字
    if (ch >= '0' && ch <= '9') {
      let end = i;
      while (end < len && /[0-9._a-fA-FxX]/.test(code[end])) end += 1;
      pushToken(tokens, code.slice(i, end), 'number');
      i = end;
      continue;
    }

    // 5) 标识符 / 关键字
    if (IDENT_START.test(ch)) {
      let end = i;
      while (end < len && IDENT_PART.test(code[end])) end += 1;
      const word = code.slice(i, end);
      // 关键字表统一小写存储，SQL 等语言大小写不敏感，比较时归一化但保留原文
      pushToken(tokens, word, keywords.has(word.toLowerCase()) ? 'keyword' : 'plain');
      i = end;
      continue;
    }

    // 6) 其它（空白、运算符、标点）
    pushToken(tokens, ch, 'plain');
    i += 1;
  }

  return tokens;
}
