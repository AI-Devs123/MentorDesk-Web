/**
 * 网页策展流类型定义（对齐后端 nexusmind-api 契约）
 *
 * 后端契约：
 *   GET  /api/v1/curate/stream?url=&taskId=&forceRender=   (Gateway :8080, text/event-stream)
 *   POST /api/v1/curate/cancel?taskId=                     (AbortController 联动)
 *   帧来源：WebCurateProgress（Gateway → Supervisor 编排 → agent-workers 执行）
 *
 * stage 取值：
 *   SECURITY_CHECK → SSRF 边界准入声明（SecurityGuard）
 *   FETCHING       → 双通道抓取 + 正文提纯
 *   EXTRACTED      → LLM 元数据萃取 + 语义分块（带真实 chunkCount / 降噪比）
 *   STAGED         → Markdown 落盘沙箱（payloadJson = StagedPayload）
 *   COMPLETED      → 全流程完成（payloadJson = WebCurateResult）
 *   FAILED         → 失败（content 可能含 SecurityGuard / SSRF 关键词）
 *   SECURITY_VIOLATION → RBAC 越权熔断（专属红色告警）
 *   AUTH_ERROR     → JWT 无效 / 缺角色
 *   ERROR          → 其它编排错误
 */

export type CurateStreamStatus =
  | 'idle'
  | 'streaming'
  | 'completed'
  | 'security_violation'
  | 'error';

/** LLM 萃取出的结构化元数据（镜像后端 WebDocMetadata） */
export interface WebDocMetadata {
  title: string;
  summary: string;
  tags: string[];
  entities: string[];
}

/** 完整入库结果（镜像后端 WebCurateResult，COMPLETED 帧 payloadJson） */
export interface WebCurateResultData {
  requestId: string;
  /** URL SHA256 前 12 位，同 URL 重复入库幂等 */
  docId: string;
  /** 相对沙箱根路径，如 inbox/web/20261027_xxx.md */
  sandboxSavedPath: string;
  metadata: WebDocMetadata;
  chunkCount: number;
  /** 纯净正文字符数 */
  charCount: number;
  canonicalUrl: string;
  renderJsUsed: boolean;
  /** 原始 HTML 字符数；与 charCount 联立可算真实降噪比 */
  rawHtmlCharCount: number;
  /** 落盘文件真实字节数 */
  fileSizeBytes: number;
}

/** STAGED 帧负载（落盘先行回执，无需等 COMPLETED） */
export interface StagedPayload {
  docId: string;
  sandboxSavedPath: string;
  fileSizeBytes: number;
  chunkCount: number;
}

/** 网关 SSE 单帧 */
export interface WebCurateFrame {
  taskId?: string;
  timestamp?: string | number;
  stage?: string;
  agentName?: string;
  message?: string;
  /** 仅 STAGED / COMPLETED 帧携带；其余为 "{}" */
  payloadJson?: string;
  /** 单行日志：[HH:mm:ss] AgentName → message */
  content?: string;
}

/** 控制台单行日志 */
export interface StreamLog {
  timestamp: string;
  agentName: string;
  message: string;
  stage?: string;
  isError?: boolean;
}

/** 真实降噪比：被剔除的 HTML 噪声占原始 HTML 的比例（0~100） */
export function calcNoiseReduction(data: WebCurateResultData): number {
  if (!data.rawHtmlCharCount || data.rawHtmlCharCount <= 0) return 0;
  const reduced = data.rawHtmlCharCount - data.charCount;
  if (reduced <= 0) return 0;
  return Math.min(100, Math.round((reduced * 100) / data.rawHtmlCharCount));
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
