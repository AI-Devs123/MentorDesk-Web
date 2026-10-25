import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { UserInfo } from '../utils/auth';

interface Props {
  user: UserInfo | null;
  onLogout: () => void;
}

export const UserBar: React.FC<Props> = ({ user, onLogout }) => {
  const location = useLocation();

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
        flexWrap: 'wrap',
        gap: '12px',
      }}
    >
      <h2 style={{ margin: 0, color: '#fff' }}>NexusMind Supervisor 控制台</h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', flexWrap: 'wrap' }}>
        <span style={{ color: '#d4d4d8' }}>
          用户: <strong style={{ color: '#60a5fa' }}>{user.username}</strong>
        </span>
        <span style={{ color: '#d4d4d8' }}>
          角色: <strong style={{ color: '#4ade80' }}>{roleLabel}</strong>
        </span>
        <span style={{ color: '#10b981' }}>● Token 激活中 (1小时有效)</span>

        {/* 导航链接 */}
        {location.pathname !== '/' && (
          <Link
            to="/"
            style={{
              padding: '4px 8px',
              background: '#3f3f46',
              border: 'none',
              color: '#fff',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              textDecoration: 'none',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = '#52525b';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = '#3f3f46';
            }}
          >
            ← 返回控制台
          </Link>
        )}

        {location.pathname !== '/sandbox/journal' && (
          <Link
            to="/sandbox/journal"
            style={{
              padding: '4px 8px',
              background: '#1e40af',
              border: 'none',
              color: '#fff',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              textDecoration: 'none',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = '#1e3a8a';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = '#1e40af';
            }}
          >
            📝 日记沙箱
          </Link>
        )}

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
