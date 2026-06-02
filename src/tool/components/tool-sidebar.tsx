'use client';

import { useMemo } from 'react';
import { computeDiff } from './tool-canvas';

/** Props for the diff viewer sidebar panel. */
interface ToolSidebarProps {
  original: string;
  modified: string;
  viewMode: string;
  showWhitespace: boolean;
  contextLines: number;
  onViewModeChange?: (mode: 'side-by-side' | 'unified' | 'split') => void;
  onShowWhitespaceChange?: (show: boolean) => void;
  onContextLinesChange?: (lines: number) => void;
  onSwap?: () => void;
  onClear?: () => void;
  onCopyDiff?: () => void;
}

export function ToolSidebar({
  original,
  modified,
  viewMode,
  showWhitespace,
  contextLines,
  onShowWhitespaceChange,
  onContextLinesChange,
  onSwap,
  onClear,
  onCopyDiff,
}: ToolSidebarProps) {
  const origLines = original ? original.split('\n').length : 0;
  const modLines = modified ? modified.split('\n').length : 0;
  const origChars = original.length;
  const modChars = modified.length;

  // Compute diff stats using the same LCS algorithm as the diff view
  const diffStats = useMemo(() => {
    if (!original && !modified) return { additions: 0, deletions: 0, changes: 0 };
    // Use -1 contextLines to get full diff without collapsing
    const lines = computeDiff(original, modified, -1);
    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
      if (line.type === 'added') additions++;
      else if (line.type === 'removed') deletions++;
    }
    return { additions, deletions, changes: additions + deletions };
  }, [original, modified]);

  return (
    <div className="diff-sidebar">
      <div className="sidebar-section">
        <h3>Statistics</h3>
        <dl className="stats-list">
          <div className="stat-row">
            <dt>Original Lines</dt>
            <dd>{origLines.toLocaleString()}</dd>
          </div>
          <div className="stat-row">
            <dt>Original Characters</dt>
            <dd>{origChars.toLocaleString()}</dd>
          </div>
          <div className="stat-row">
            <dt>Modified Lines</dt>
            <dd>{modLines.toLocaleString()}</dd>
          </div>
          <div className="stat-row">
            <dt>Modified Characters</dt>
            <dd>{modChars.toLocaleString()}</dd>
          </div>{' '}
          {origChars > 1_000_000 || modChars > 1_000_000 ? (
            <div
              className="stat-row"
              style={{
                marginTop: '0.25rem',
                padding: '0.375rem 0.5rem',
                background: 'var(--warning)',
                color: '#fff',
                borderRadius: 'var(--radius)',
                fontSize: '0.75rem',
                fontWeight: 500,
              }}
            >
              Large input detected — diff may be slower
            </div>
          ) : null}
          <div className="stat-row" style={{ marginTop: '0.25rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
            <dt style={{ color: 'var(--success)' }}>Additions</dt>
            <dd style={{ color: 'var(--success)' }}>+{diffStats.additions.toLocaleString()}</dd>
          </div>
          <div className="stat-row">
            <dt style={{ color: 'var(--error)' }}>Deletions</dt>
            <dd style={{ color: 'var(--error)' }}>-{diffStats.deletions.toLocaleString()}</dd>
          </div>
          <div className="stat-row">
            <dt>Net Changes</dt>
            <dd>{diffStats.changes.toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <div className="sidebar-section">
        <h3>View Options</h3>

        <div className="sidebar-option-row">
          <label className="sidebar-checkbox-label">
            <input
              type="checkbox"
              checked={showWhitespace}
              onChange={(e) => onShowWhitespaceChange?.(e.target.checked)}
            />
            <span>Show Whitespace</span>
          </label>
        </div>

        {viewMode === 'unified' && (
          <div className="sidebar-option-row">
            <label className="sidebar-label" htmlFor="context-lines">
              Context Lines
            </label>
            <input
              id="context-lines"
              type="number"
              min={0}
              max={20}
              value={contextLines}
              onChange={(e) =>
                onContextLinesChange?.(Math.max(0, Math.min(20, Number(e.target.value))))
              }
              className="sidebar-number-input"
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                fontSize: '0.8125rem',
                fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
                background: 'var(--background)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            />
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <h3>Actions</h3>
        <button
          type="button"
          className="sidebar-action-btn"
          onClick={onSwap}
          disabled={!original && !modified}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--card)',
            color: !original && !modified ? 'var(--muted)' : 'var(--foreground)',
            cursor: !original && !modified ? 'not-allowed' : 'pointer',
            opacity: !original && !modified ? 0.5 : 1,
            marginBottom: '0.5rem',
          }}
          title={!original && !modified ? 'Paste text in a panel first' : 'Swap original ↔ modified'}
        >
          Swap Original ↔ Modified
        </button>
        <button
          type="button"
          className="sidebar-action-btn"
          onClick={onClear}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            border: '1px solid var(--error)',
            borderRadius: 'var(--radius)',
            background: 'transparent',
            color: 'var(--error)',
            cursor: 'pointer',
          }}
        >
          Clear Both
        </button>
        <button
          type="button"
          className="sidebar-action-btn"
          onClick={onCopyDiff}
          disabled={!original && !modified}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--card)',
            color: !original && !modified ? 'var(--muted)' : 'var(--foreground)',
            cursor: !original && !modified ? 'not-allowed' : 'pointer',
            opacity: !original && !modified ? 0.5 : 1,
            marginTop: '0.5rem',
          }}
          title={!original && !modified ? 'Paste text first' : 'Copy unified diff to clipboard'}
        >
          Copy Unified Diff
        </button>
      </div>
    </div>
  );
}
