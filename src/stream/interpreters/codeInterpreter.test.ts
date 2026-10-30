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

  it('SUSPEND_FOR_CONFIRMATION → 解析为 suspend（5-B 就绪态）', () => {
    const r = interpretCodeFrame({
      stage: 'SUSPEND_FOR_CONFIRMATION',
      taskId: 'T1',
      execution_id: 'exec-1',
      token: 'tok-abc',
      operation_type: 'FILE_DELETE',
      risk_level: 'HIGH',
      description: '将删除文件: /tmp/old.txt',
      affected_files: ['/tmp/old.txt'],
      change_preview: '将删除文件: /tmp/old.txt',
      expires_at: '2026-10-30T12:00:00Z',
    });
    expect(r.freeze).toBe(true);
    expect(r.suspend?.execution_id).toBe('exec-1');
    expect(r.suspend?.token).toBe('tok-abc');
    expect(r.suspend?.operation_type).toBe('FILE_DELETE');
    expect(r.suspend?.risk_level).toBe('HIGH');
    expect(r.suspend?.affected_files).toEqual(['/tmp/old.txt']);
    expect(r.suspend?.change_preview).toBe('将删除文件: /tmp/old.txt');
  });

  it('LAYER3_CONFIRMATION_REQUIRED 同样识别为 suspend', () => {
    const r = interpretCodeFrame({ stage: 'LAYER3_CONFIRMATION_REQUIRED', content: 'x' });
    expect(r.suspend).toBeDefined();
    expect(r.freeze).toBe(true);
  });
});
