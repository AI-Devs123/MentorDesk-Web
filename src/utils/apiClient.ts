import { authStorage } from './auth';
import type { JournalReviewResponse } from '../types/cognitive';

export interface RequestOptions extends RequestInit {
  baseURL?: string;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = '') {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { baseURL = this.baseURL, ...fetchOptions } = options;
    const url = `${baseURL}${endpoint}`;

    // 自动携带 Token
    const token = authStorage.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    } as Record<string, string>;

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    // 401 或过期时清空存储并触发登出
    if (response.status === 401) {
      authStorage.clear();
      window.dispatchEvent(new CustomEvent('auth-expired'));
      throw new Error('Token 已过期，请重新登录');
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();

/**
 * 日记相关 API 集合
 * 与后端端点: /api/v1/journal/* 对接
 *
 * 注意：后端当前仅实现 POST /api/v1/journal/review（同步返回完整结果），
 * 尚无 SSE 流式端点（/api/v1/journal/{entryId}/stream 未实现），
 * 待后端补齐流式通道后再加订阅方法。
 */
export const journalAPI = {
  /**
   * 提交日记草稿进行结构化抽取和落盘
   * @param rawContent 原始日记内容
   * @returns 结构化抽取结果和物理落盘信息
   */
  submitForReview: (rawContent: string) => {
    return apiClient.post<JournalReviewResponse>(
      '/api/v1/journal/review',
      { rawContent }
    );
  },
};

/**
 * 沙箱文档读取响应（Slice 3 新增端点 GET /api/v1/sandbox/doc）
 * 与后端 SandboxDocController 一一对应。
 */
export interface SandboxDocPayload {
  /** 相对沙箱根的路径 */
  path: string;
  /** 落盘文件真实字节数 */
  sizeBytes: number;
  /** 是否因超过字符上限被截断 */
  truncated: boolean;
  /** Markdown 正文 */
  content: string;
}

/**
 * 沙箱文档 API 集合
 * 与后端端点: GET /api/v1/sandbox/doc 对接
 *
 * 网页策展把正文提纯为 Markdown 落盘到沙箱（inbox/web/*.md），
 * 但 STAGED / COMPLETED 帧只回传路径与字节数，正文需经本端点读取。
 * 后端侧受 PathSandboxValidator 约束（防目录穿越）与 RBAC 角色白名单限制。
 */
export const sandboxDocAPI = {
  /**
   * 读取沙箱内已落盘的 Markdown 正文
   * @param relativePath 相对沙箱根路径，如 inbox/web/20261027_xxx.md
   */
  readMarkdown: (relativePath: string): Promise<SandboxDocPayload> => {
    return apiClient.get<SandboxDocPayload>(
      `/api/v1/sandbox/doc?path=${encodeURIComponent(relativePath)}`
    );
  },
};

/**
 * RAG 语义切片取数响应（Slice 5 / 5-D）
 *
 * 后端端点 GET /api/v1/rag/chunk?docId=&index= 当前尚未实现（原 Week 7 部分），
 * 此处先定义契约与前端调用。待后端补齐后，本调用即可返回真实切片正文。
 */
export interface RagChunkPayload {
  /** 文档 ID */
  docId: string;
  /** 切片序号（从 0 起） */
  chunkIndex: number;
  /** 该文档切片总数 */
  totalChunks: number;
  /** 切片 Markdown 正文 */
  content: string;
  /** 是否因超过上限被截断 */
  truncated: boolean;
}

/**
 * RAG 语义切片 API 集合
 *
 * 与后端端点 GET /api/v1/rag/chunk 对接（当前后端未实现，前端为就绪态）。
 * 网页策展把正文切片为 CuratedDocumentChunk 并送入向量库，但 SSE 帧仅回传 chunkCount，
 * 正文需经本端点按需取用（避免在前端伪造切片内容）。
 */
export const ragAPI = {
  /**
   * 按文档 ID 与切片序号取回该切片正文
   * @param docId 文档 ID
   * @param index 切片序号（从 0 起）
   */
  getChunk: (docId: string, index: number): Promise<RagChunkPayload> => {
    return apiClient.get<RagChunkPayload>(
      `/api/v1/rag/chunk?docId=${encodeURIComponent(docId)}&index=${index}`
    );
  },
};
