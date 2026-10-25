import React from 'react';
import type { UserInfo } from '../utils/auth';

interface Props {
  user: UserInfo | null;
  onLogout: () => void;
}

/**
 * 顶部栏用户区
 *
 * 导航已移交侧边栏（Sidebar），本组件只负责
 * 用户信息展示 + 退出登录。无用户时渲染空。
 */
export const UserBar: React.FC<Props> = ({ user, onLogout }) => {
  if (!user) return null;

  const roleLabel = user.role === 'supervisor' ? '管理员' : '操作员';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', flexWrap: 'wrap' }}>
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
          e.currentTarget.style.background = '#52525b';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#3f3f46';
        }}
      >
        退出登录
      </button>
    </div>
  );
};
