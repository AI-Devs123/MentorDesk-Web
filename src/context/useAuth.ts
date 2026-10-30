import { useContext } from 'react';
import { AuthContext } from './authContextDef';

/**
 * 使用全局认证状态（必须在 AuthProvider 内使用）
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  }
  return ctx;
}
