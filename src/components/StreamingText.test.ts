import { describe, it, expect } from 'vitest';
import { resolveTyping, AUTO_TYPE_MAX_LEN } from '../components/StreamingTextUtil';

describe('resolveTyping', () => {
  it('短文本且请求启用时，开启打字机', () => {
    expect(resolveTyping('hello', true)).toBe(true);
  });

  it('显式关闭时，不启用打字机', () => {
    expect(resolveTyping('hello', false)).toBe(false);
  });

  it('超长文本即使请求启用也自动降级', () => {
    const long = 'x'.repeat(AUTO_TYPE_MAX_LEN + 1);
    expect(resolveTyping(long, true)).toBe(false);
    expect(resolveTyping(long, false)).toBe(false);
  });

  it('恰好等于阈值长度时仍启用', () => {
    const at = 'x'.repeat(AUTO_TYPE_MAX_LEN);
    expect(resolveTyping(at, true)).toBe(true);
  });

  it('尊重自定义最大长度', () => {
    expect(resolveTyping('abcdef', true, 5)).toBe(false);
    expect(resolveTyping('abc', true, 5)).toBe(true);
  });
});
