import { describe, it, expect } from 'vitest';
import {
  isUnifiedDiff,
  parseUnifiedDiff,
  type DiffLineType,
} from './diffParse';

describe('isUnifiedDiff', () => {
  it('命中 --- a/ 特征', () => {
    expect(isUnifiedDiff('--- a/foo\n+++ b/foo')).toBe(true);
  });
  it('命中 +++ b/ 特征', () => {
    expect(isUnifiedDiff('+++ b/bar.py')).toBe(true);
  });
  it('命中 @@ 特征', () => {
    expect(isUnifiedDiff('@@ -1,3 +1,4 @@')).toBe(true);
  });
  it('描述性文案不算 diff', () => {
    expect(isUnifiedDiff('将删除文件: /tmp/old.txt')).toBe(false);
  });
  it('网关 prompt 文案不算 diff', () => {
    expect(isUnifiedDiff('prompt: rm -rf /data')).toBe(false);
  });
  it('空串不算', () => {
    expect(isUnifiedDiff('')).toBe(false);
  });
});

describe('parseUnifiedDiff', () => {
  it('非 diff 输入降级：isUnified=false、files 空、raw 透传', () => {
    const r = parseUnifiedDiff('将删除文件: /tmp/old.txt');
    expect(r.isUnified).toBe(false);
    expect(r.files).toHaveLength(0);
    expect(r.raw).toBe('将删除文件: /tmp/old.txt');
  });

  it('解析多行增删与 hunk 头', () => {
    const diff = [
      'diff --git a/src/main.py b/src/main.py',
      'index 111..222 100644',
      '--- a/src/main.py',
      '+++ b/src/main.py',
      '@@ -1,3 +1,4 @@',
      ' def foo():',
      '-    old_line()',
      '+    new_line()',
      '+    added()',
      '     return',
    ].join('\n');

    const r = parseUnifiedDiff(diff);
    expect(r.isUnified).toBe(true);
    expect(r.files).toHaveLength(1);
    const f = r.files[0];
    expect(f.filePath).toBe('src/main.py');

    const types: DiffLineType[] = f.lines.map((l) => l.type);
    expect(types).toContain('add');
    expect(types).toContain('del');
    expect(types).toContain('hunk');
    expect(types).toContain('meta');
    expect(types).toContain('context');

    // 删除行与新增行内容正确保留前缀
    const del = f.lines.find((l) => l.type === 'del');
    expect(del?.text).toBe('-    old_line()');
    const add = f.lines.find((l) => l.type === 'add');
    expect(add?.text).toBe('+    new_line()');
  });

  it('无 diff --git 头、仅 @@ + 行时仍解析为单文件（路径为空）', () => {
    const diff = ['@@ -0,0 +1,2 @@', '+line one', '+line two'].join('\n');
    const r = parseUnifiedDiff(diff);
    expect(r.isUnified).toBe(true);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].filePath).toBe('');
    expect(r.files[0].lines.filter((l) => l.type === 'add')).toHaveLength(2);
  });

  it('多文件按 diff --git 切分', () => {
    const diff = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-a',
      '+A',
      'diff --git a/b.txt b/b.txt',
      '--- a/b.txt',
      '+++ b/b.txt',
      '@@ -1 +1 @@',
      '-b',
      '+B',
    ].join('\n');
    const r = parseUnifiedDiff(diff);
    expect(r.files).toHaveLength(2);
    expect(r.files[0].filePath).toBe('a.txt');
    expect(r.files[1].filePath).toBe('b.txt');
  });
});
