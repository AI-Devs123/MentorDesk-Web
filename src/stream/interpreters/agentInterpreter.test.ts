import { describe, it, expect } from 'vitest';
import { agentInterpreter } from './agentInterpreter';

describe('agentInterpreter', () => {
  it('普通帧转成带 stage 的日志', () => {
    const r = agentInterpreter({ stage: 'GATEWAY', content: 'hello' });
    expect(r.logs?.[0].message).toBe('hello');
    expect(r.logs?.[0].stage).toBe('GATEWAY');
    expect(r.suspend).toBeUndefined();
    expect(r.freeze).toBeFalsy();
  });

  it('三个挂起 stage 映射为 SuspendData', () => {
    const r = agentInterpreter({
      stage: 'SUSPEND_FOR_CONFIRMATION',
      execution_id: 'dag-1',
      token: 'tok-9',
      content: '破坏性操作',
      risk_level: 'CRITICAL',
      affected_files: ['/a.py'],
      expires_at: '2099-01-01T00:00:00Z',
    });
    expect(r.suspend?.execution_id).toBe('dag-1');
    expect(r.suspend?.token).toBe('tok-9');
    expect(r.suspend?.risk_level).toBe('CRITICAL');
    expect(r.suspend?.affected_files).toEqual(['/a.py']);
    expect(r.suspend?.expires_at).toBe('2099-01-01T00:00:00Z');
  });

  it('挂起帧缺省字段兜底', () => {
    const r = agentInterpreter({ stage: 'LAYER3_CONFIRMATION_REQUIRED', content: 'x' });
    expect(r.suspend?.risk_level).toBe('MEDIUM');
    expect(r.suspend?.affected_files).toEqual([]);
    expect(r.suspend?.execution_id).toBe('');
  });
});
