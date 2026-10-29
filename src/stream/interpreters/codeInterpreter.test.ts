import { describe, it, expect } from 'vitest';
import { interpretCodeFrame } from './codeInterpreter';

describe('interpretCodeFrame', () => {
  it('SECURITY_VIOLATION → 熔断', () => {
    const r = interpretCodeFrame({ stage: 'SECURITY_VIOLATION', content: '越权' });
    expect(r.freeze).toBe(true);
    expect(r.setStatus).toBe('security_violation');
  });

  it('COMPLETED → completed + 文件计数', () => {
    const r = interpretCodeFrame({ stage: 'COMPLETED', totalFiles: 12, processedFiles: 12 });
    expect(r.setStatus).toBe('completed');
    expect(r.setProcessedFiles).toBe(12);
  });

  it('PARSING → addFile + 计数', () => {
    const r = interpretCodeFrame({ stage: 'PARSING', currentFile: '/a.java', totalFiles: 5, processedFiles: 1 });
    expect(r.setStage).toBe('PARSING');
    expect(r.addFile?.filePath).toBe('/a.java');
    expect(r.setTotalFiles).toBe(5);
  });

  it('INDEXED → addSymbols + currentFile', () => {
    const r = interpretCodeFrame({
      stage: 'INDEXED',
      currentFile: '/b.java',
      payloadJson: JSON.stringify([{ symbolId: 's1', name: 'foo', kind: 'METHOD', filePath: '/b.java' }]),
    });
    expect(r.setCurrentFile).toBe('/b.java');
    expect(r.addSymbols?.[0].symbolId).toBe('s1');
  });

  it('INDEXED 非法 JSON → 无符号', () => {
    const r = interpretCodeFrame({ stage: 'INDEXED', payloadJson: 'bad' });
    expect(r.addSymbols).toBeUndefined();
  });

  it('FAILED 普通 → error', () => {
    const r = interpretCodeFrame({ stage: 'FAILED', content: 'boom' });
    expect(r.setStatus).toBe('error');
  });
});
