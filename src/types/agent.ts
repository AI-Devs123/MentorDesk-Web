/**
 * 切片 5：确认事件数据结构（含Diff预览）
 */
export interface SuspendData {
  execution_id: string;
  token: string;
  operation_type: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affected_files?: string[];
  change_preview?: string;
  expires_at: string;
}

/**
 * 标准流式数据帧
 */
export interface StreamEventChunk {
  timestamp: number;
  stage: string;
  taskId: string;
  content: string;
}
