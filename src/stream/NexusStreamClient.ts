/**
 * 纯传输层（零 React 依赖，可单测）
 *
 * 职责单一：统一发起 fetch + 读 ReadableStream + 解码 + 分帧 + 逐帧回调。
 * 统一注入 Bearer Token 与可选 X-Agent-Context；统一 401/403/AbortError 语义。
 * 所有「领域状态机」逻辑（agent/curate/code/cognitive）都不在这里，交给上层 Hook / interpreter。
 */
import { parseFrame, splitSseFrames } from './sseParser';
import type { StreamFrame } from './eventTypes';

export type OpenStreamQuery = Record<string, string | number | boolean>;

export interface OpenStreamOpts {
  url: string;
  method?: 'GET' | 'POST';
  token?: string | null;
  query?: OpenStreamQuery;
  body?: unknown;
  agentContext?: string;
  headers?: Record<string, string>;
  signal: AbortSignal;
}

export interface StreamCallbacks {
  onFrame: (frame: StreamFrame) => void;
  onOpen?: () => void;
  onError?: (err: Error) => void;
  onDone?: () => void;
}

export class StreamHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StreamHttpError';
    this.status = status;
  }
}

function buildUrl(url: string, query?: OpenStreamQuery): string {
  if (!query || Object.keys(query).length === 0) return url;
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${qs}`;
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(typeof e === 'string' ? e : 'unknown stream error');
}

export async function openStream(opts: OpenStreamOpts, cb: StreamCallbacks): Promise<void> {
  const {
    url,
    method = 'GET',
    token,
    query,
    body,
    agentContext,
    headers,
    signal,
  } = opts;

  const fullUrl = buildUrl(url, query);
  const reqHeaders: Record<string, string> = {
    Accept: 'text/event-stream',
    ...(headers ?? {}),
  };
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
  if (agentContext) reqHeaders['X-Agent-Context'] = agentContext;
  if (method === 'POST' && body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      method,
      headers: reqHeaders,
      body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    cb.onError?.(toError(e));
    return;
  }

  if (!response.ok) {
    const msg =
      response.status === 403
        ? '请求被拒绝 (403)：可能是接口不存在、方法不匹配或角色权限不足'
        : `HTTP ${response.status}: ${response.statusText}`;
    cb.onError?.(new StreamHttpError(response.status, msg));
    return;
  }
  if (!response.body) {
    cb.onError?.(new Error('响应体为空，无法读取流'));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let opened = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!opened) {
        opened = true;
        cb.onOpen?.();
      }
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = splitSseFrames(buffer);
      buffer = rest;
      for (const f of frames) {
        const parsed = parseFrame(f);
        if (parsed) cb.onFrame(parsed);
      }
    }
    if (!opened) cb.onOpen?.();
    cb.onDone?.();
  } catch (e) {
    cb.onError?.(toError(e));
  }
}
