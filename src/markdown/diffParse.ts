/**
 * Unified Diff 解析器（Slice 5 / 5-A）
 *
 * 后端 change_preview 有两种真实形态：
 *  1) 真实 unified diff —— 当 @DestructiveOperation(requiresDiff=true) 且工具入参带 proposedContent 时，
 *     由 DiffEngine.toUnifiedDiff 产出（新增内容以 `+` 行呈现）。
 *  2) 描述性文案 —— 否则由 DestructiveActionAdvisor.generateChangePreview 产出，
 *     如「将删除文件: xxx」「将覆盖文件: xxx」「将执行系统命令: xxx」；
 *     网关 Layer3 破坏性拦截另产出「prompt: <原始指令>」。
 *
 * 因此解析器必须兼容两种输入：命中 unified diff 特征时做行级着色，
 * 否则降级为纯文本预览块（不伪造 diff 行）。
 */

export type DiffLineType = 'add' | 'del' | 'context' | 'hunk' | 'meta';

export interface DiffLine {
  type: DiffLineType;
  /** 含原换行前缀的原始行（如 "+foo" / "-bar" / "@@ -1,2 +1,3 @@"） */
  text: string;
}

export interface DiffFile {
  /** 从 "+++ b/<path>" 提取的相对路径；无头 diff 时为空串 */
  filePath: string;
  lines: DiffLine[];
}

export interface ParsedDiff {
  /** 是否命中 unified diff 特征 */
  isUnified: boolean;
  /** 按 "diff --git" 切分的多文件区块 */
  files: DiffFile[];
  /** 原始字符串（降级展示用） */
  raw: string;
}

/** 是否看起来像 unified diff（宽松：命中任一特征即算） */
export function isUnifiedDiff(text: string): boolean {
  return /(?:^|\n)(?:(?:--- a\/|\+\+\+ b\/|@@ ).*)/.test(text);
}

/**
 * 解析 unified diff 文本为结构化文件/行数组。
 * 输入非 diff 时返回 isUnified=false、files 为空，由调用方降级展示 raw。
 */
export function parseUnifiedDiff(text: string): ParsedDiff {
  if (!text || !isUnifiedDiff(text)) {
    return { isUnified: false, files: [], raw: text };
  }

  const lines = text.split(/\r?\n/);
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  for (const raw of lines) {
    // 新文件区块起点
    if (/^diff --git /.test(raw)) {
      current = { filePath: '', lines: [] };
      files.push(current);
      current.lines.push({ type: 'meta', text: raw });
      continue;
    }

    // 在首个 diff --git 之前的零星行（少见）：归入一个匿名文件
    if (!current) {
      current = { filePath: '', lines: [] };
      files.push(current);
    }

    if (/^\+\+\+ /.test(raw)) {
      const m = raw.match(/^\+\+\+ b\/(.+?)\s*$/) ?? raw.match(/^\+\+\+ (.+?)\s*$/);
      if (m && current) current.filePath = m[1];
      current.lines.push({ type: 'meta', text: raw });
    } else if (/^--- /.test(raw)) {
      current.lines.push({ type: 'meta', text: raw });
    } else if (/^@@ /.test(raw)) {
      current.lines.push({ type: 'hunk', text: raw });
    } else if (/^\+/.test(raw)) {
      current.lines.push({ type: 'add', text: raw });
    } else if (/^-/.test(raw)) {
      current.lines.push({ type: 'del', text: raw });
    } else if (/^\\/.test(raw)) {
      current.lines.push({ type: 'meta', text: raw });
    } else {
      current.lines.push({ type: 'context', text: raw });
    }
  }

  return { isUnified: true, files, raw: text };
}
