import { describe, it, expect, vi, afterEach } from 'vitest';
import { openStream, StreamHttpError } from './NexusStreamClient';

function makeStream(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
}

function mockFetchOnce(body: string, status = 200) {
  return vi.fn(async () => {
    return new Response(makeStream(body), {
      status,
      headers: { 'content-type': 'text/event-stream' },
    });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error 还原全局 fetch
  global.fetch = undefined;
});

describe('openStream', () => {
  it('逐帧回调并触发 onDone', async () => {
    const body =
      'data: {"stage":"A","content":"1"}\n\ndata: {"stage":"B","content":"2"}\n\n';
    global.fetch = mockFetchOnce(body) as unknown as typeof fetch;

    const frames: unknown[] = [];
    await openStream(
      { url: '/x', signal: new AbortController().signal },
      {
        onFrame: (f) => frames.push(f),
        onDone: () => frames.push('DONE'),
      },
    );
    expect(frames.length).toBe(3); // 2 帧 + DONE
    expect((frames[0] as { stage: string }).stage).toBe('A');
    expect((frames[1] as { stage: string }).stage).toBe('B');
  });

  it('注入 Bearer 与 X-Agent-Context', async () => {
    const fetchMock = mockFetchOnce('data: {}\n\n');
    global.fetch = fetchMock as unknown as typeof fetch;
    await openStream(
      {
        url: '/x',
        token: 'tok-123',
        agentContext: 'CODE_AGENT',
        signal: new AbortController().signal,
      },
      { onFrame: () => {} },
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
    expect((init.headers as Record<string, string>)['X-Agent-Context']).toBe('CODE_AGENT');
  });

  it('拼接 query 到 URL', async () => {
    const fetchMock = mockFetchOnce('data: {}\n\n');
    global.fetch = fetchMock as unknown as typeof fetch;
    await openStream(
      { url: '/x', query: { prompt: 'hi', agent: 'Supervisor' }, signal: new AbortController().signal },
      { onFrame: () => {} },
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('prompt=hi');
    expect(url).toContain('agent=Supervisor');
  });

  it('403 映射为 StreamHttpError', async () => {
    global.fetch = mockFetchOnce('err', 403) as unknown as typeof fetch;
    let err: Error | null = null;
    await openStream(
      { url: '/x', signal: new AbortController().signal },
      { onFrame: () => {}, onError: (e) => (err = e) },
    );
    expect(err).toBeInstanceOf(StreamHttpError);
    expect((err as StreamHttpError).status).toBe(403);
  });

  it('AbortError 透传给 onError', async () => {
    global.fetch = (async () => {
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch;
    let err: Error | null = null;
    await openStream(
      { url: '/x', signal: new AbortController().signal },
      { onFrame: () => {}, onError: (e) => (err = e) },
    );
    expect(err?.name).toBe('AbortError');
  });

  it('跨块半包也能完整解析', async () => {
    const part1 = 'data: {"stage":"A","content":"1"}\n\ndata: {"stage';
    const part2 = '":"B","content":"2"}\n\n';
    const enc = new TextEncoder();
    global.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(part1));
            c.enqueue(enc.encode(part2));
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )) as unknown as Response;
    const stages: string[] = [];
    await openStream(
      { url: '/x', signal: new AbortController().signal },
      { onFrame: (f) => stages.push(f.stage ?? '') },
    );
    expect(stages).toEqual(['A', 'B']);
  });
});
