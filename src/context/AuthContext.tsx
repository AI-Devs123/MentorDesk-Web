import React, { useCallback, useEffect, useState } from 'react';
import { authStorage } from '../utils/auth';
import type { UserInfo } from '../utils/auth';
import { AuthContext } from './authContextDef';

/**
 * 全局认证上下文
 *
 * 取代原 per-component 的 useAuth（每个组件各持一份 state，
 * 登录后其他组件感知不到）。登录状态提升为全局单例，
 * LoginPage 登录成功后 RequireAuth / MainLayout 立即可见。
 */

/** 登录接口返回结构 */
interface AuthLoginResponse {
  token?: string;
  expires_in?: number;
  username?: string;
  role?: string;
  message?: string;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAuth = () => {
      if (authStorage.isAuthenticated()) {
        setCurrentUser(authStorage.getUser());
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
        setCurrentUser(null);
      }
      setIsLoading(false);
    };

    checkAuth();

    // Token 过期事件（apiClient 401 时派发）
    const handleAuthExpired = () => {
      setIsLoggedIn(false);
      setCurrentUser(null);
    };

    // 登录成功 / 其他标签页变更
    const handleStorageChange = () => {
      checkAuth();
    };

    window.addEventListener('auth-expired', handleAuthExpired);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const contentType = response.headers.get('content-type');
    let data: AuthLoginResponse;
    try {
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`服务器返回错误 (${response.status}): ${text.slice(0, 100)}`);
      }
    } catch (parseErr: unknown) {
      if (parseErr instanceof Error && parseErr.message.startsWith('服务器返回错误')) {
        throw parseErr;
      }
      const reason = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`响应解析失败: ${reason}`, { cause: parseErr });
    }

    if (!response.ok) {
      throw new Error(data.message || '登录失败');
    }

    if (!data.token || data.expires_in == null) {
      throw new Error(data.message || '登录响应缺少令牌信息');
    }
    authStorage.setToken(data.token, data.expires_in, {
      username: data.username ?? '',
      role: data.role ?? '',
    });

    setCurrentUser(authStorage.getUser());
    setIsLoggedIn(true);
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
    setIsLoggedIn(false);
    setCurrentUser(null);
  }, []);

  const getToken = useCallback(() => authStorage.getToken(), []);

  return (
    <AuthContext.Provider value={{ currentUser, isLoggedIn, isLoading, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};
