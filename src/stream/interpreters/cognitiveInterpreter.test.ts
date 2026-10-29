import { describe, it, expect } from 'vitest';
import { interpretCognitiveFrame } from './cognitiveInterpreter';

describe('interpretCognitiveFrame', () => {
  it('journal_result 数据帧 → setPayload', () => {
    const r = interpretCognitiveFrame({
      event: 'journal_result',
      data: JSON.stringify({ entry: { entryId: 'e1' }, physicalPath: '/p' }),
    });
    expect(r.setPayload?.entry.entryId).toBe('e1');
  });

  it('tutor_prompt 数据帧 → setTutorPrompt', () => {
    const r = interpretCognitiveFrame({
      event: 'tutor_prompt',
      data: JSON.stringify({ promptId: 'p1', questions: [] }),
    });
    expect(r.setTutorPrompt?.promptId).toBe('p1');
  });

  it('done 终帧 → setCompleted + 进度', () => {
    const r = interpretCognitiveFrame({ stage: 'done', content: 'WORKFLOW_COMPLETED' });
    expect(r.setCompleted).toBe(true);
    expect(r.addProgress?.content).toBe('WORKFLOW_COMPLETED');
  });

  it('AUTH_ERROR → setError', () => {
    const r = interpretCognitiveFrame({ stage: 'AUTH_ERROR', content: 'no token' });
    expect(r.setError).toContain('no token');
  });

  it('过程帧 → addProgress', () => {
    const r = interpretCognitiveFrame({ stage: 'Supervisor', content: 'thinking', status: 'RUNNING' });
    expect(r.addProgress?.status).toBe('RUNNING');
  });
});
