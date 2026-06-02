'use client';

import { useMemo } from 'react';
import './diff-viewer.css';

/** Props for the diff viewer toolbar. */
interface ToolToolbarProps {
  original: string;
  modified: string;
  viewMode: string;
}

export function ToolToolbar({ original, modified, viewMode }: ToolToolbarProps) {
  const stats = useMemo(() => {
    const origLines = original ? original.split('\n').length : 0;
    const modLines = modified ? modified.split('\n').length : 0;
    const origChars = original.length;
    const modChars = modified.length;

    if (!original && !modified) return null;

    return { origLines, modLines, origChars, modChars };
  }, [original, modified]);

  const viewModeLabel =
    viewMode === 'side-by-side' ? 'Side-by-Side' : viewMode === 'unified' ? 'Unified' : 'Split';

  return (
    <div className="diff-toolbar">
      <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
        {original || modified ? (
          <>
            {stats && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span title="Original lines / characters">
                  <span style={{ color: 'var(--error)' }}>−</span>{' '}
                  {stats.origLines}L / {stats.origChars.toLocaleString()}C
                </span>
                <span style={{ color: 'var(--border)' }}>|</span>
                <span title="Modified lines / characters">
                  <span style={{ color: 'var(--success)' }}>+</span>{' '}
                  {stats.modLines}L / {stats.modChars.toLocaleString()}C
                </span>
                <span style={{ color: 'var(--border)' }}>|</span>
                <span title="Current view mode" style={{ fontStyle: 'italic', opacity: 0.7 }}>
                  {viewModeLabel}
                </span>
              </span>
            )}
          </>
        ) : (
          'Paste text in both panels to compare'
        )}
      </span>
    </div>
  );
}

ToolToolbar.displayName = 'ToolToolbar';
