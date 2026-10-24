import React, { useState } from 'react';
import { authStorage } from '../utils/auth';

interface Props {
  onLoginSuccess: () => void;
  onError?: (error: string) => void;
}

export const LoginModal: React.FC<Props> = ({ onLoginSuccess, onError }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      // 使用相对路径，Vite 代理转发到后端
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const contentType = res.headers.get('content-type');
      let data;

      try {
        if (contentType?.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          setErrorMsg(`服务器返回错误 (${res.status}): ${text}`);
          return;
        }
      } catch (parseErr) {
        setErrorMsg(`JSON 解析失败: ${parseErr}`);
        return;
      }

      if (!res.ok) {
        const error = data.message || '登录失败';
        setErrorMsg(error);
        onError?.(error);
        return;
      }

      // 保存 Token 和用户信息到 localStorage
      authStorage.setToken(data.token, data.expires_in, {
        username: data.username,
        role: data.role,
      });

      // 触发登录成功回调
      onLoginSuccess();
    } catch (err: any) {
      const error = `网络错误: ${err.message}`;
      setErrorMsg(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
      }}
    >
      <div
        style={{
          background: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '12px',
          padding: '32px',
          width: '380px',
          color: '#f4f4f5',
          fontFamily: 'monospace',
        }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#60a5fa' }}>
          NexusMind 身份鉴权
        </h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#a1a1aa' }}>
          请输入凭据获取 1 小时有效 Token
        </p>

        {errorMsg && (
          <div
            style={{
              padding: '8px 12px',
              background: '#7f1d1d',
              borderRadius: '6px',
              color: '#fca5a5',
              fontSize: '12px',
              marginBottom: '16px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#d4d4d8', display: 'block', marginBottom: '4px' }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin / user"
              style={{
                width: '100%',
                padding: '8px',
                background: '#27272a',
                border: '1px solid #52525b',
                borderRadius: '6px',
                color: '#fff',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#d4d4d8', display: 'block', marginBottom: '4px' }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="默认 admin123"
              style={{
                width: '100%',
                padding: '8px',
                background: '#27272a',
                border: '1px solid #52525b',
                borderRadius: '6px',
                color: '#fff',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '12px',
              padding: '10px',
              background: '#2563eb',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '正在验证...' : '登录并获取 Token'}
          </button>
        </form>

        <div style={{ marginTop: '16px', fontSize: '11px', color: '#71717a' }}>
          * 默认管理权限: admin / admin123 (角色: supervisor)
          <br />
          * 普通用户: user / user123 (角色: operator)
        </div>
      </div>
    </div>
  );
};
