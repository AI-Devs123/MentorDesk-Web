import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { UserBar } from './UserBar';
import { findNavItem } from '../config/navigation';
import { useAuth } from '../context/useAuth';
import { loadCollapsed, COLLAPSED_KEY } from '../config/sidebarState';

/**
 * 主布局 —— 登录后所有业务页面的外壳
 *
 * 结构：可折叠侧边栏 + 顶部栏（页面标题/用户信息/退出）+ 内容区（Outlet）
 * 新增业务页面 = 路由表加一项 + NAV_ITEMS 加一项，本组件零改动。
 */
export const MainLayout: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const navItem = findNavItem(location.pathname);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#09090b' }}>
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* 顶部栏 */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '0 24px',
            minHeight: '60px',
            borderBottom: '1px solid #3f3f46',
            background: '#18181b',
            flexWrap: 'wrap',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: '#f4f4f5' }}>
            {navItem?.title ?? 'NexusMind'}
          </h1>
          <UserBar user={currentUser} onLogout={logout} />
        </header>

        {/* 页面内容 */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
