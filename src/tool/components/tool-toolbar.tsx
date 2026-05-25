'use client';

import { useCallback, useRef, useState } from 'react';

export function ToolToolbar() {
  return (
    <div className="diff-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span className="toolbar-brand-section" style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
        Paste text in both panels to compare
      </span>
    </div>
  );
}
