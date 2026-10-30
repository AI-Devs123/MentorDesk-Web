/**
 * 沙箱 Markdown 正文查看器（Slice 3 · Phase 4）
 *
 * 把 STAGED / COMPLETED 帧回传的 sandboxSavedPath 变成「可读的正文」：
 *  - 默认 button 模式：点击「查看 Markdown 正文」才向后端 GET /api/v1/sandbox/doc 拉取，
 *    避免对大文件做无谓的自动请求；
 *  - 拉回的 content 交给 MarkdownStream 渲染（沿用其 XSS 防护口径：无 rehype-raw、协议白名单）；
 *  - 后端对正文做 1MB 截断，truncated=true 时给出提示，避免用户误以为看到全文；
 *  - 网络 / 鉴权错误（401/403/SECURITY_VIOLATION）原样透出到界面。
 *
 * 竞态防护：一次会话内可能多次开始新任务导致 path 变化，用自增 reqId 丢弃过期响应。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { sandboxDocAPI, type SandboxDocPayload } from '../utils/apiClient';
import MarkdownStream from './MarkdownStream';

interface Props {
  /** 相对沙箱根路径，如 inbox/web/20261027_xxx.md */
  path: string;
  /** button：点击展开；auto：挂载即拉取。默认 button */
  mode?: 'button' | 'auto';
}

export const SandboxMarkdownViewer: React.FC<Props> = ({ path, mode = 'button' }) => {
  const [doc, setDoc] = useState<SandboxDocPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(mode === 'auto');
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const payload = await sandboxDocAPI.readMarkdown(path);
      if (id !== reqId.current) return; // 过期响应直接丢弃
      setDoc(payload);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [path]);

  // auto 模式：挂载时拉一次
  useEffect(() => {
    if (mode === 'auto') void load();
    // 仅挂载时执行一次；path 变化由调用方通过 key 重新挂载控制
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && !doc && !loading) void load();
  }, [open, doc, loading, load]);

  if (!path) return null;

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      {mode === 'button' && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-slate-200 text-xs font-medium transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            {open ? '收起 Markdown 正文' : '查看 Markdown 正文'}
          </span>
          {loading ? (
            <span className="inline-block w-3.5 h-3.5 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-slate-500">{open ? '▲' : '▼'}</span>
          )}
        </button>
      )}

      {(open || mode === 'auto') && (
        <div className="p-3 bg-slate-950/40">
          {loading && <div className="text-xs text-slate-400">正文读取中…</div>}
          {error && (
            <div className="text-xs text-red-300 bg-red-950/30 border border-red-800/50 rounded p-2">
              读取失败：{error}
            </div>
          )}
          {doc && (
            <>
              {doc.truncated && (
                <div className="mb-2 text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded px-2 py-1">
                  正文超过 1MB 上限，已截断显示（共 {doc.sizeBytes} 字节）
                </div>
              )}
              <MarkdownStream text={doc.content} typing={false} emptyHint="（文件为空）" />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SandboxMarkdownViewer;
