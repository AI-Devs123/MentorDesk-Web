import React from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export const TaskInput: React.FC<Props> = ({ value, onChange, onSubmit, isLoading }) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      onSubmit();
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', margin: '16px 0' }}>
      <input
        style={{
          flex: 1,
          padding: '8px 12px',
          background: '#222',
          border: '1px solid #444',
          color: '#fff',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入指令（按 Enter 或点击发送）"
      />
      <button
        style={{
          padding: '8px 16px',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.6 : 1,
          fontWeight: '500',
          transition: 'background 0.2s',
        }}
        disabled={isLoading}
        onClick={onSubmit}
        onMouseEnter={(e) => {
          if (!isLoading) {
            (e.target as HTMLButtonElement).style.background = '#1d4ed8';
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading) {
            (e.target as HTMLButtonElement).style.background = '#2563eb';
          }
        }}
      >
        {isLoading ? '执行中...' : '发送指令'}
      </button>
    </div>
  );
};
