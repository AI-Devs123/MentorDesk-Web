import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CPS,
  INITIAL_TYPEWRITER_STATE,
  closeUnterminatedFence,
  isComplete,
  nextVisible,
  sliceVisible,
  typewriterReducer,
  type TypewriterState,
} from './typewriter';

describe('nextVisible', () => {
  it('按 cps 与经过时间推进（先乘后取整，不被取整误差拖慢）', () => {
    expect(nextVisible(0, 1000, 1000, 90)).toBe(90);
    expect(nextVisible(0, 1000, 500, 90)).toBe(45);
    expect(nextVisible(90, 1000, 500, 90)).toBe(135);
  });

  it('推进结果不超过目标长度', () => {
    expect(nextVisible(95, 100, 1000, 90)).toBe(100);
  });

  it('目标缩短（新一轮/重置）直接对齐，不逐字回退', () => {
    expect(nextVisible(50, 20, 16, 90)).toBe(20);
    expect(nextVisible(50, 0, 16, 90)).toBe(0);
  });

  it('极短帧至少推进 1 个字符，避免卡住不动', () => {
    expect(nextVisible(0, 100, 1, 90)).toBe(1);
    expect(nextVisible(0, 100, 5, 90)).toBe(1);
  });

  it('cps <= 0 视为不限速，立即全显（skip / 降低动效）', () => {
    expect(nextVisible(0, 500, 16, 0)).toBe(500);
    expect(nextVisible(0, 500, 16, -1)).toBe(500);
  });

  it('非法入参被安全收敛（NaN / 负 / 小数）', () => {
    expect(nextVisible(Number.NaN, 100, 1000, 90)).toBe(90);
    expect(nextVisible(-5, 100, 1000, 90)).toBe(90);
    expect(nextVisible(0, -1, 1000, 90)).toBe(0);
    expect(nextVisible(0, 100, Number.NaN, 90)).toBe(1); // elapsed 归零后仍至少推进 1
  });

  it('默认 cps 生效且为正值', () => {
    expect(DEFAULT_CPS).toBeGreaterThan(0);
    expect(nextVisible(0, 1000, 1000)).toBe(DEFAULT_CPS);
  });
});

describe('isComplete', () => {
  it('已显示数达到目标即为完成', () => {
    expect(isComplete(10, 10)).toBe(true);
    expect(isComplete(11, 10)).toBe(true);
    expect(isComplete(9, 10)).toBe(false);
  });

  it('空文本视为已完成', () => {
    expect(isComplete(0, 0)).toBe(true);
  });
});

describe('sliceVisible', () => {
  it('按字符数安全截取', () => {
    expect(sliceVisible('hello world', 5)).toBe('hello');
  });

  it('超出长度与非法入参被夹紧，不抛错', () => {
    expect(sliceVisible('abc', 999)).toBe('abc');
    expect(sliceVisible('abc', -1)).toBe('');
    expect(sliceVisible('', 5)).toBe('');
  });
});

describe('closeUnterminatedFence', () => {
  it('围栏已闭合时原样返回', () => {
    const md = 'intro\n\n```java\nint x = 1;\n```\n';
    expect(closeUnterminatedFence(md)).toBe(md);
  });

  it('围栏未闭合时补齐收尾围栏（避免代码块中途渲染成段落再跳变）', () => {
    const partial = 'intro\n\n```java\nint x = ';
    expect(closeUnterminatedFence(partial)).toBe(`${partial}\n\`\`\``);
  });

  it('已以换行结尾时不再多插空行', () => {
    const partial = '```\ncode\n';
    expect(closeUnterminatedFence(partial)).toBe('```\ncode\n```');
  });

  it('识别 ~~~ 围栏与最多三空格缩进', () => {
    expect(closeUnterminatedFence('  ~~~\ntext')).toBe('  ~~~\ntext\n```');
  });

  it('无围栏的普通文本不被改动', () => {
    expect(closeUnterminatedFence('普通段落\n第二行')).toBe('普通段落\n第二行');
  });
});

describe('typewriterReducer', () => {
  const started: TypewriterState = { visible: 5, base: 'hello' };

  it('文本追加时延续进度（流式吐字不重置）', () => {
    const s = typewriterReducer(started, { type: 'text', text: 'hello world', enabled: true });
    expect(s.visible).toBe(5);
    expect(s.base).toBe('hello world');
  });

  it('文本被替换时从头开始打（新一轮执行）', () => {
    const s = typewriterReducer(started, { type: 'text', text: 'new task', enabled: true });
    expect(s.visible).toBe(0);
    expect(s.base).toBe('new task');
  });

  it('文本缩短时也从头开始打', () => {
    const s = typewriterReducer(started, { type: 'text', text: 'hi', enabled: true });
    expect(s.visible).toBe(0);
  });

  it('文本引用未变时返回同一对象（避免无意义重渲染）', () => {
    const s = typewriterReducer(started, { type: 'text', text: 'hello', enabled: true });
    expect(s).toBe(started);
  });

  it('关闭动画时直接对齐到全文', () => {
    const s = typewriterReducer(INITIAL_TYPEWRITER_STATE, {
      type: 'text',
      text: 'abcdef',
      enabled: false,
    });
    expect(s.visible).toBe(6);
  });

  it('tick 按 cps 推进，且已完成时不再变化', () => {
    const s = typewriterReducer(
      { visible: 0, base: 'x'.repeat(100) },
      { type: 'tick', elapsedMs: 1000, cps: 90, target: 100 },
    );
    expect(s.visible).toBe(90);

    const done = typewriterReducer(
      { visible: 100, base: 'x'.repeat(100) },
      { type: 'tick', elapsedMs: 1000, cps: 90, target: 100 },
    );
    expect(done.visible).toBe(100);
  });

  it('skip 立即对齐到目标长度', () => {
    const s = typewriterReducer({ visible: 3, base: 'abcdef' }, { type: 'skip', target: 6 });
    expect(s.visible).toBe(6);
  });

  it('reset 回到起点', () => {
    const s = typewriterReducer(started, { type: 'reset' });
    expect(s.visible).toBe(0);
  });
});
