import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * 登录页
 *
 * 路由: /login（无侧边栏的全屏路由，RequireAuth 之外）
 * 登录成功后跳转回原目标页（守卫记录的 state.from），默认回控制台
 */
export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      await login(username, password);
      // 跳回守卫记录的来源页（无则回控制台）
      const from = window.history.state?.usr?.from as string | undefined;
      navigate(from || '/', { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: '#09090b',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
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
