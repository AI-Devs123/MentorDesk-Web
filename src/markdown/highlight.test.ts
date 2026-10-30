import { describe, expect, it } from 'vitest';
import { highlightCode, normalizeLang, type HighlightToken } from './highlight';

/** 取所有指定类型的 token 文本，便于断言 */
function textsOf(tokens: HighlightToken[], kind: HighlightToken['kind']): string[] {
  return tokens.filter((t) => t.kind === kind).map((t) => t.text);
}

/** 拼接回原文，用于验证「切分不丢字符」这一不变式 */
function joined(tokens: HighlightToken[]): string {
  return tokens.map((t) => t.text).join('');
}

describe('normalizeLang', () => {
  it('识别常用别名', () => {
    expect(normalizeLang('java')).toBe('java');
    expect(normalizeLang('Java')).toBe('java');
    expect(normalizeLang('js')).toBe('javascript');
    expect(normalizeLang('ts')).toBe('typescript');
    expect(normalizeLang('py')).toBe('python');
    expect(normalizeLang('sh')).toBe('bash');
  });

  it('未知或缺失语言返回 null（渲染层据此退回纯文本）', () => {
    expect(normalizeLang('brainfuck')).toBeNull();
    expect(normalizeLang('')).toBeNull();
    expect(normalizeLang(undefined)).toBeNull();
  });
});

describe('highlightCode', () => {
  it('识别 Java 关键字', () => {
    const tokens = highlightCode('public class Foo {}', 'java');
    expect(textsOf(tokens, 'keyword')).toEqual(['public', 'class']);
  });

  it('字符串内的关键字不被误着色', () => {
    const tokens = highlightCode('final String s = "public class";', 'java');
    // 仅 final 是关键字；String 是类名，引号内的 public/class 不参与着色
    expect(textsOf(tokens, 'keyword')).toEqual(['final']);
    expect(textsOf(tokens, 'string')).toEqual(['"public class"']);
  });

  it('行注释整行归为 comment，其中的关键字不参与着色', () => {
    const tokens = highlightCode('// class Foo\nint x;', 'java');
    expect(textsOf(tokens, 'comment')).toEqual(['// class Foo']);
    expect(textsOf(tokens, 'keyword')).toEqual(['int']);
  });

  it('块注释整段归为 comment', () => {
    const tokens = highlightCode('/* a\nb */\nint y;', 'java');
    expect(textsOf(tokens, 'comment')).toEqual(['/* a\nb */']);
  });

  it('Python 用 # 作行注释', () => {
    const tokens = highlightCode('# 注释\ndef foo():', 'python');
    expect(textsOf(tokens, 'comment')).toEqual(['# 注释']);
    expect(textsOf(tokens, 'keyword')).toEqual(['def']);
  });

  it('SQL 用 -- 作行注释且关键字大小写不敏感', () => {
    const tokens = highlightCode('-- 注释\nSELECT * FROM t', 'sql');
    expect(textsOf(tokens, 'comment')).toEqual(['-- 注释']);
    expect(textsOf(tokens, 'keyword')).toEqual(['SELECT', 'FROM']);
  });

  it('数字被归为 number', () => {
    const tokens = highlightCode('int n = 42;', 'java');
    expect(textsOf(tokens, 'number')).toEqual(['42']);
  });

  it('未闭合字符串止于行尾，不吞噬后续代码', () => {
    const tokens = highlightCode("String s = \"abc\nint x = 1;", 'java');
    // 第二行仍能识别出关键字，说明字符串没有一路吞到底
    expect(textsOf(tokens, 'keyword')).toContain('int');
  });

  it('未知语言原样返回单个 plain token（绝不猜）', () => {
    const tokens = highlightCode('public class Foo {}', 'brainfuck');
    expect(tokens).toEqual([{ text: 'public class Foo {}', kind: 'plain' }]);
  });

  it('空代码返回空数组', () => {
    expect(highlightCode('', 'java')).toEqual([]);
  });

  it('不变式：切分后拼回原文，字符不丢不乱', () => {
    const samples: Array<[string, string]> = [
      ['public class Foo { private int x = 42; }', 'java'],
      ['def foo():\n    return "bar"  # comment', 'python'],
      ['const a = `tpl ${x}`; // ok', 'typescript'],
      ['{"k": 1, "n": null}', 'json'],
      ['echo "hi" # note', 'bash'],
    ];
    samples.forEach(([code, lang]) => {
      expect(joined(highlightCode(code, lang))).toBe(code);
    });
  });
});
