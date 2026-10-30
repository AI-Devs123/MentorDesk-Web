import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

/**
 * 路由守卫 —— 未登录重定向到 /login，登录后恢复原目标路径
 */
export const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isLoggedIn, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          background: '#09090b',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontFamily: 'monospace',
        }}
      >
        加载中...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
};
