'use client';

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
}: ToolSidebarProps) {
  const origLines = original ? original.split('\n').length : 0;
  const modLines = modified ? modified.split('\n').length : 0;
  const origChars = original.length;
  const modChars = modified.length;

  const numAdditions = 0; // will be computed in live version
  const numDeletions = 0;

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
            color: 'var(--foreground)',
            cursor: 'pointer',
            marginBottom: '0.5rem',
          }}
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
      </div>
    </div>
  );
}
