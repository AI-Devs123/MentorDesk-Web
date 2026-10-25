import { authStorage } from './auth';

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
    return apiClient.post<any>(
      '/api/v1/journal/review',
      { rawContent }
    );
  },
};
