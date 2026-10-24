import React, { useEffect, useRef } from 'react';

interface Props {
  logs: string[];
}

export const LogViewer: React.FC<Props> = ({ logs }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={logContainerRef}
      style={{
        background: '#000',
        border: '1px solid #333',
        padding: '12px',
        minHeight: '200px',
        maxHeight: '400px',
        borderRadius: '4px',
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#888',
      }}
    >
      <div style={{ color: '#666', marginBottom: '8px' }}>--- 执行控制台输出 ---</div>
      {logs.length === 0 && (
        <div style={{ color: '#4a5568' }}>等待指令执行...</div>
      )}
      {logs.map((log, index) => (
        <div key={index} style={{ margin: '4px 0', color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {log}
        </div>
      ))}
    </div>
  );
};
