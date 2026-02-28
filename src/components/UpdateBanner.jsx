import React, { useState, useEffect } from 'react';

export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    if (!window.api?.onUpdateAvailable) return;
    const remove = window.api.onUpdateAvailable((data) => setUpdate(data));
    return remove;
  }, []);

  if (!update) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '10px 16px',
        background: 'rgba(109, 40, 217, 0.97)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13,
        gap: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      <span>
        A new version <strong>v{update.version}</strong> is available.{' '}
        <a
          href={update.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#e9d5ff', textDecoration: 'underline' }}
        >
          Download now
        </a>
      </span>
      <button
        onClick={() => setUpdate(null)}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '0 4px',
          opacity: 0.8,
        }}
      >
        ×
      </button>
    </div>
  );
}
