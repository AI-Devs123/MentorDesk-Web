import React from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../config/navigation';

/** 折叠状态持久化 key */
const COLLAPSED_KEY = 'nexusmind_sidebar_collapsed';

function loadCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_KEY) === 'true';
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * 可折叠侧边导航栏
 *
 * - 展开 240px：图标 + 文字；折叠 64px：仅图标（title 提示 + 悬停tooltip）
 * - 折叠状态持久化 localStorage，刷新后保持
 * - 导航项来自 NAV_ITEMS 配置，新增业务零改本组件
 */
export const Sidebar: React.FC<Props> = ({ collapsed, onToggle }) => {
  return (
    <aside
      style={{
        width: collapsed ? '64px' : '240px',
        minWidth: collapsed ? '64px' : '240px',
        transition: 'width 200ms ease, min-width 200ms ease',
        background: '#18181b',
        borderRight: '1px solid #3f3f46',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflow: 'hidden',
      }}
    >
      {/* 品牌区 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: collapsed ? '16px 0' : '16px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: '1px solid #3f3f46',
          minHeight: '60px',
        }}
      >
        <span style={{ fontSize: '20px' }}>🧠</span>
        {!collapsed && (
          <span style={{ color: '#f4f4f5', fontWeight: 500, fontSize: '15px', whiteSpace: 'nowrap' }}>
            NexusMind
          </span>
        )}
      </div>

      {/* 导航项 */}
      <nav style={{ flex: 1, padding: collapsed ? '12px 8px' : '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            title={collapsed ? item.label : undefined}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: collapsed ? '10px 0' : '10px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '13px',
              whiteSpace: 'nowrap',
              color: isActive ? '#60a5fa' : '#a1a1aa',
              background: isActive ? '#1e3a8a33' : 'transparent',
              borderLeft: isActive && !collapsed ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'background 150ms ease, color 150ms ease',
            })}
          >
            <span style={{ fontSize: '16px', flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* 底部：折叠开关 */}
      <div style={{ borderTop: '1px solid #3f3f46', padding: collapsed ? '12px 0' : '12px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onToggle}
          title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            background: '#27272a',
            border: '1px solid #52525b',
            borderRadius: '6px',
            color: '#d4d4d8',
            cursor: 'pointer',
            fontSize: '12px',
            width: collapsed ? '40px' : '100%',
            justifyContent: 'center',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#3f3f46';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#27272a';
          }}
        >
          <span style={{ fontSize: '14px' }}>{collapsed ? '»' : '«'}</span>
          {!collapsed && <span>折叠</span>}
        </button>
      </div>
    </aside>
  );
};

export { loadCollapsed, COLLAPSED_KEY };
