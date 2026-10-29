/**
 * 纯函数 SSE 分帧器（零依赖，可单测）
 *
 * 同时兼容两种协议：
 *  1. data-only：   data: {...json...}                      （4 个旧 hook）
 *  2. event: 行：   event: RESULT\nid: x\n...\ndata: {...}   （网关检索流）
 *
 * 规范细节：
 *  - 以 \n\n（或 \r\n\r\n）切分帧，支持跨块半包续接
 *  - 忽略以 : 开头的注释 / ping 心跳行
 *  - data: 后若紧跟一个空格则去除（仅一个，SSE 规范）
 *  - 多 data: 行用 \n 连接（同一事件分片）
 *  - data 尝试 JSON.parse；成功则展开字段，失败则作为 content 文本
 */
import type { StreamFrame } from './eventTypes';

/** 把一段 SSE 文本切成已完成帧 + 残留半包 */
export function splitSseFrames(raw: string): { frames: string[]; rest: string } {
  const normalized = raw.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  // 过滤掉纯空白块（避免空帧）
  const frames = parts.filter((p) => p.trim().length > 0);
  return { frames, rest };
}

/** 解析单个 SSE 块（可含 event:/id:/data: 多行 + 注释行） */
export function parseFrame(raw: string): StreamFrame | null {
  const lines = raw.split('\n');
  let event: string | undefined;
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === '') continue;
    if (trimmed.startsWith(':')) continue; // 注释 / ping 心跳
    if (trimmed.startsWith('event:')) {
      event = trimmed.slice(6).trim();
      continue;
    }
    if (trimmed.startsWith('id:')) {
      id = trimmed.slice(3).trim();
      continue;
    }
    if (trimmed.startsWith('data:')) {
      let v = trimmed.slice(5);
      if (v.startsWith(' ')) v = v.slice(1);
      dataLines.push(v);
      continue;
    }
    // retry: 等其它字段忽略
  }

  const data = dataLines.join('\n');
  if (data === '' && event === undefined) return null;

  const frame: StreamFrame = {};
  if (event !== undefined) frame.event = event;
  if (id !== undefined) frame.id = id;

  if (data !== '') {
    frame.dataRaw = data;
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(frame, parsed);
      } else {
        frame.content = data;
      }
    } catch {
      frame.content = data;
    }
  }
  return frame;
}
