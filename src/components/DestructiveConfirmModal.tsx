import React, { useState, useEffect } from 'react';
import type { SuspendData } from '../types/agent';

interface Props {
  data: SuspendData;
  onConfirm: () => Promise<void>;
  onReject: () => Promise<void>;
}

export const DestructiveConfirmModal: React.FC<Props> = ({ data, onConfirm, onReject }) => {
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    const expireTime = new Date(data.expires_at).getTime();
    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expireTime - now) / 1000));
      setRemainingSeconds(diff);
      if (diff === 0) {
        onReject();
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [data.expires_at, onReject]);

  const formatCountdown = (totalSec: number) => {
    const min = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, '0');
    const sec = (totalSec % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return '#ef4444';
      case 'HIGH':
        return '#fb923c';
      case 'MEDIUM':
        return '#eab308';
      default:
        return '#3b82f6';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          backgroundColor: '#121214',
          border: '1px solid #7f1d1d',
          boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)',
          borderRadius: '12px',
          padding: '24px',
          color: '#f4f4f5',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* 标题栏与倒计时 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #27272a',
            paddingBottom: '16px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '18px',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              🛡️ SecurityGuard: 拦截到高危破坏性操作
            </h3>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '12px',
                color: '#a1a1aa',
              }}
            >
              任务 ID:{' '}
              <code style={{ color: '#38bdf8' }}>{data.execution_id}</code>
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                fontSize: '11px',
                color: '#71717a',
                display: 'block',
              }}
            >
              授权时效倒计时
            </span>
            <span
              style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: remainingSeconds < 120 ? '#ef4444' : '#eab308',
              }}
            >
              ⏳ {formatCountdown(remainingSeconds)}
            </span>
          </div>
        </div>

        {/* 风险参数卡片 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          <div
            style={{
              background: '#18181b',
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid #27272a',
            }}
          >
            <span style={{ color: '#71717a' }}>操作类型: </span>
            <span style={{ fontWeight: 'bold', color: '#f87171' }}>
              {data.operation_type}
            </span>
          </div>

          <div
            style={{
              background: '#18181b',
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid #27272a',
            }}
          >
            <span style={{ color: '#71717a' }}>风险等级: </span>
            <span
              style={{
                fontWeight: 'bold',
                color: getRiskColor(data.risk_level),
              }}
            >
              {data.risk_level}
            </span>
          </div>
        </div>

        {/* 差异比对 Diff 视图 */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '12px',
              color: '#a1a1aa',
              marginBottom: '6px',
              fontWeight: 600,
            }}
          >
            文件修改与差异审查 (Diff Preview):
          </div>
          <pre
            style={{
              margin: 0,
              padding: '12px',
              backgroundColor: '#09090b',
              border: '1px solid #27272a',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#4ade80',
              overflowX: 'auto',
              maxHeight: '180px',
              lineHeight: '1.5',
            }}
          >
            {`--- a/${data.description}
+++ /dev/null
@@ -1,1 +0,0 @@
- ${data.change_preview || data.description}

[Security Alert]: 该操作不可逆，原文件将先行归档至 .trash/ 目录后执行硬删除。`}
          </pre>
        </div>

        {/* 控制按钮区 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              await onReject();
              setSubmitting(false);
            }}
            style={{
              padding: '8px 18px',
              backgroundColor: '#27272a',
              color: '#d4d4d8',
              border: '1px solid #3f3f46',
              borderRadius: '6px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            拒绝并回滚
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              await onConfirm();
              setSubmitting(false);
            }}
            style={{
              padding: '8px 18px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              boxShadow: '0 4px 14px 0 rgba(220, 38, 38, 0.39)',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? '核准执行中...' : '核准并物理执行'}
          </button>
        </div>
      </div>
    </div>
  );
};
