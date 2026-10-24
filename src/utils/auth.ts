const TOKEN_KEY = 'nexusmind_token';
const EXPIRES_AT_KEY = 'nexusmind_token_expires_at';
const USER_KEY = 'nexusmind_user';

export interface UserInfo {
  username: string;
  role: string;
}

export const authStorage = {
  setToken(token: string, expiresInSeconds: number, user: UserInfo) {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRES_AT_KEY, expiresAt.toString());
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  getToken(): string | null {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);

    if (!token || !expiresAt) {
      this.clear();
      return null;
    }

    // 前端主动检查 1 小时是否已到期
    if (Date.now() > parseInt(expiresAt, 10)) {
      this.clear();
      return null;
    }

    return token;
  },

  getUser(): UserInfo | null {
    const userStr = localStorage.getItem(USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    localStorage.removeItem(USER_KEY);
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
