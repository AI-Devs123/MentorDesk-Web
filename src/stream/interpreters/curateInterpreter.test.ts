import { describe, it, expect } from 'vitest';
import { interpretCurateFrame } from './curateInterpreter';

describe('interpretCurateFrame', () => {
  it('SECURITY_VIOLATION → 熔断 + 安全消息', () => {
    const r = interpretCurateFrame({ stage: 'SECURITY_VIOLATION', content: '越权访问' });
    expect(r.freeze).toBe(true);
    expect(r.setStatus).toBe('security_violation');
    expect(r.setSecurityMessage).toContain('越权');
  });

  it('FAILED 带关键词 → 兜底为安全熔断', () => {
    const r = interpretCurateFrame({ stage: 'FAILED', content: 'SecurityGuard 拦截' });
    expect(r.freeze).toBe(true);
    expect(r.setStatus).toBe('security_violation');
  });

  it('FAILED 普通 → error', () => {
    const r = interpretCurateFrame({ stage: 'FAILED', content: '网络错误' });
    expect(r.freeze).toBe(true);
    expect(r.setStatus).toBe('error');
  });

  it('AUTH_ERROR → 认证失败', () => {
    const r = interpretCurateFrame({ stage: 'AUTH_ERROR', content: '' });
    expect(r.freeze).toBe(true);
    expect(r.setStatus).toBe('error');
    expect(r.setError).toContain('认证');
  });

  it('STAGED → setStaged', () => {
    const r = interpretCurateFrame({
      stage: 'STAGED',
      payloadJson: JSON.stringify({ sandboxSavedPath: '/inbox/x.md', fileSizeBytes: 10, chunkCount: 2 }),
    });
    expect(r.setStaged?.sandboxSavedPath).toBe('/inbox/x.md');
  });

  it('COMPLETED → setResult + completed', () => {
    const r = interpretCurateFrame({
      stage: 'COMPLETED',
      payloadJson: JSON.stringify({ docId: 'd', sandboxSavedPath: '/x', metadata: {}, chunkCount: 1, charCount: 5, canonicalUrl: 'u', renderJsUsed: false, rawHtmlCharCount: 9, fileSizeBytes: 7 }),
    });
    expect(r.setStatus).toBe('completed');
    expect(r.setResult?.docId).toBe('d');
  });

  it('COMPLETED 非法 JSON → 错误熔断', () => {
    const r = interpretCurateFrame({ stage: 'COMPLETED', payloadJson: 'not-json' });
    expect(r.freeze).toBe(true);
    expect(r.setStatus).toBe('error');
  });

  it('过程帧 → 产出 logEntry', () => {
    const r = interpretCurateFrame({ stage: 'FETCHING', content: '抓取中', agentName: 'WebCurator' });
    expect(r.logEntry?.agentName).toBe('WebCurator');
    expect(r.setStatus).toBeUndefined();
  });
});
