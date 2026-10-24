import { useState, useEffect, useCallback } from 'react';
import { authStorage } from '../utils/auth';
import type { UserInfo } from '../utils/auth';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 初始化：检查本地存储的 Token
  useEffect(() => {
    const checkAuth = () => {
      if (authStorage.isAuthenticated()) {
        setCurrentUser(authStorage.getUser());
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
      setIsLoading(false);
    };

    checkAuth();

    // 监听 Token 过期事件
    const handleAuthExpired = () => {
      setIsLoggedIn(false);
      setCurrentUser(null);
    };

    // 监听 storage 变化（当登录成功时更新）
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
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '登录失败');
      }

      // 保存 Token 和用户信息
      authStorage.setToken(data.token, data.expires_in, {
        username: data.username,
        role: data.role,
      });

      setCurrentUser(authStorage.getUser());
      setIsLoggedIn(true);
    } catch (error) {
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
    setIsLoggedIn(false);
    setCurrentUser(null);
  }, []);

  const getToken = useCallback(() => {
    return authStorage.getToken();
  }, []);

  return {
    currentUser,
    isLoggedIn,
    isLoading,
    login,
    logout,
    getToken,
  };
}
