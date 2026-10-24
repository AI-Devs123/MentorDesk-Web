import React from 'react';
import type { UserInfo } from '../utils/auth';

interface Props {
  user: UserInfo | null;
  onLogout: () => void;
}

export const UserBar: React.FC<Props> = ({ user, onLogout }) => {
  if (!user) return null;

  const roleLabel = user.role === 'supervisor' ? '管理员' : '操作员';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #333',
        paddingBottom: '12px',
        marginBottom: '16px',
      }}
    >
      <h2 style={{ margin: 0, color: '#fff' }}>NexusMind Supervisor 控制台</h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
        <span style={{ color: '#d4d4d8' }}>
          用户: <strong style={{ color: '#60a5fa' }}>{user.username}</strong>
        </span>
        <span style={{ color: '#d4d4d8' }}>
          角色: <strong style={{ color: '#4ade80' }}>{roleLabel}</strong>
        </span>
        <span style={{ color: '#10b981' }}>● Token 激活中 (1小时有效)</span>
        <button
          onClick={onLogout}
          style={{
            padding: '4px 8px',
            background: '#3f3f46',
            border: 'none',
            color: '#fff',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background = '#52525b';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = '#3f3f46';
          }}
        >
          退出登录
        </button>
      </div>
    </div>
  );
};
