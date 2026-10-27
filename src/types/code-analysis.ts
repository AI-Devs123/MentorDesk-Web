/**
 * 代码分析流类型定义（对齐后端 nexusmind-api 契约）
 *
 * 后端契约：
 *   GET /api/v1/code/analyze/stream?projectName=&taskId=&language=  (Gateway :8080)
 *   帧来源：CodeAnalysisProgress（Supervisor 编排 → agent-workers 执行）
 *
 * stage 取值：
 *   SCANNING  → 遍历目录、锁定源文件清单（带 totalFiles）
 *   PARSING   → 逐文件解析（带 currentFile + processedFiles/totalFiles）
 *   INDEXED   → 单文件符号增量（payloadJson = UnifiedCodeSymbol[]）
 *   COMPLETED → 全项目完成
 *   FAILED    → 失败（content 可能含 SecurityGuard/AccessDenied 关键词）
 *   SECURITY_VIOLATION → RBAC 安全熔断（专属红色告警）
 *   AUTH_ERROR → JWT 无效/缺角色
 *   ERROR      → 其它编排错误
 */

export type StreamStatus =
  | 'idle'
  | 'streaming'
  | 'completed'
  | 'security_violation'
  | 'error';

/** 方法参数描述子（镜像后端 UnifiedCodeSymbol.MethodParam） */
export interface MethodParam {
  name: string;
  type: string;
}

/**
 * 统一代码符号（镜像后端 UnifiedCodeSymbol，字段 1:1）
 */
export interface UnifiedCodeSymbol {
  symbolId: string;
  parentId?: string | null;
  language?: string;
  name: string;
  /** CLASS / INTERFACE / ENUM / RECORD / METHOD / CONSTRUCTOR / FIELD */
  kind: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  modifiers?: string[];
  returnType?: string | null;
  parameters?: MethodParam[];
  superTypes?: string[];
  signature?: string;
  docComment?: string | null;
  callees?: string[];
  annotations?: string[];
}

/**
 * 网关 SSE 单帧（网关把 CodeAnalysisProgress 转成 Map 推送）
 * 注意 timestamp 在进度帧里是 String，在错误帧里是 number，故放宽为 string | number
 */
export interface CodeAnalysisFrame {
  taskId?: string;
  timestamp?: string | number;
  /** 见文件头 stage 取值 */
  stage?: string;
  currentFile?: string;
  processedFiles?: number;
  totalFiles?: number;
  /** 仅 INDEXED 帧携带当前文件符号 JSON 数组；其余帧为 "{}" */
  payloadJson?: string;
  content?: string;
}
