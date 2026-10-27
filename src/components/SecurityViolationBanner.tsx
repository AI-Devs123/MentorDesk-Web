import React from 'react';

interface Props {
  /** 后端下发的熔断文案（含 SecurityGuard / AccessDenied 语义） */
  message: string;
}

/**
 * 安全熔断专属告警（切片5）
 *
 * 与普通错误 Toast 严格区分：
 * - 红色告警条 + 安全徽章，不自动消失
 * - 明确说明已触发 SecurityGuard 访问控制熔断（越权访问非代码沙箱区域）
 * - 提示下游 DAG 已立即停止流转，避免用户误判为「接口超时/网络错误」
 */
export const SecurityViolationBanner: React.FC<Props> = ({ message }) => {
  return (
    <div
      role="alert"
      className="border-2 border-red-600 bg-red-950/50 rounded-lg p-4 space-y-2 shadow-[0_0_24px_rgba(220,38,38,0.25)]"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-sm font-black leading-none">
          !
        </span>
        <span className="text-red-300 font-bold tracking-wide text-sm">
          SECURITY BREACH · 访问控制熔断
        </span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-700/60 font-mono">
          RBAC FORBIDDEN
        </span>
      </div>
      <p className="text-sm text-red-100 leading-relaxed">{message}</p>
      <p className="text-xs text-red-400/80 leading-relaxed">
        下游 DAG 节点已立即停止流转；本次任务已终止。请检查调用方角色权限（CodeAgent
        不得访问日记目录/系统私密数据等非代码沙箱区域）。
      </p>
    </div>
  );
};
