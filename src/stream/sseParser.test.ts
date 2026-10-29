import { describe, it, expect } from 'vitest';
import { splitSseFrames, parseFrame } from './sseParser';

describe('splitSseFrames', () => {
  it('按 \\n\\n 切分多个帧', () => {
    const raw = 'data: {"a":1}\n\ndata: {"b":2}\n\n';
    const { frames, rest } = splitSseFrames(raw);
    expect(frames.length).toBe(2);
    expect(rest).toBe('');
  });

  it('保留不完整的半包作为 rest', () => {
    const raw = 'data: {"a":1}\n\ndata: {"b":';
    const { frames, rest } = splitSseFrames(raw);
    expect(frames.length).toBe(1);
    expect(rest).toBe('data: {"b":');
  });

  it('兼容 \\r\\n\\r\\n 分隔符', () => {
    const raw = 'data: {"a":1}\r\n\r\ndata: {"b":2}\r\n\r\n';
    const { frames } = splitSseFrames(raw);
    expect(frames.length).toBe(2);
  });

  it('忽略纯空白块', () => {
    const raw = 'data: {"a":1}\n\n   \n\ndata: {"b":2}\n\n';
    const { frames } = splitSseFrames(raw);
    expect(frames.length).toBe(2);
  });
});

describe('parseFrame', () => {
  it('解析 data-only 的 JSON 帧', () => {
    const f = parseFrame('data: {"stage":"X","content":"hi"}')!;
    expect(f.stage).toBe('X');
    expect(f.content).toBe('hi');
  });

  it('解析带 event: 行的文本帧（检索流 START）', () => {
    const f = parseFrame('event: START\ndata: [10:00:00] Supervisor → 接收到指令')!;
    expect(f.event).toBe('START');
    expect(f.content).toBe('[10:00:00] Supervisor → 接收到指令');
  });

  it('解析 event: + data 为 JSON 的帧（检索流 RESULT）', () => {
    const f = parseFrame('id: req-1\nevent: RESULT\ndata: {"candidates":[{"id":"d1"}]}')!;
    expect(f.event).toBe('RESULT');
    expect(f.id).toBe('req-1');
    expect((f.candidates as Array<{ id: string }>)[0].id).toBe('d1');
  });

  it('忽略 : ping 心跳与空块', () => {
    expect(parseFrame(': ping')).toBeNull();
    expect(parseFrame('')).toBeNull();
  });

  it('data: 后单空格去除', () => {
    const f = parseFrame('data: {"stage":"Y"}')!;
    expect(f.stage).toBe('Y');
  });

  it('非 JSON 的 data 回落为 content 文本', () => {
    const f = parseFrame('data: just a string')!;
    expect(f.content).toBe('just a string');
  });

  it('支持多 data: 行用 \\n 连接', () => {
    const f = parseFrame('data: line1\ndata: line2')!;
    expect(f.content).toBe('line1\nline2');
  });
});
