import { createContext } from 'react';
import type { UserInfo } from '../utils/auth';

/**
 * 全局认证上下文的值类型与上下文对象。
 * 单独抽出此文件（不导出任何组件），以满足 react-refresh「仅导出组件」约束：
 * - AuthContext.tsx 只导出 AuthProvider 组件
 * - useAuth.ts 只导出 useAuth 钩子
 */
export interface AuthContextValue {
  currentUser: UserInfo | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
