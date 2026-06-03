'use client';

import { useMemo } from 'react';

/** Props for the diff viewer toolbar. */
interface ToolToolbarProps {
  original: string;
  modified: string;
  viewMode: 'side-by-side' | 'unified' | 'split';
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

  const LARGE_INPUT_THRESHOLD = 500_000;
  const isVeryLargeInput =
    stats &&
    (stats.origChars > LARGE_INPUT_THRESHOLD || stats.modChars > LARGE_INPUT_THRESHOLD);

  return (
    <div className="diff-toolbar">
      <span className="toolbar-info-text">
        {original || modified ? (
          <>
            {stats && (
              <span className="toolbar-stats-group">
                <span title="Original lines / characters">
                  <span className="diff-stat-deletions">−</span> {stats.origLines}L /{' '}
                  {stats.origChars.toLocaleString()}C
                </span>
                <span className="toolbar-separator">|</span>
                <span title="Modified lines / characters">
                  <span className="diff-stat-additions">+</span> {stats.modLines}L /{' '}
                  {stats.modChars.toLocaleString()}C
                </span>
                <span className="toolbar-separator">|</span>
                <span title="Current view mode" className="toolbar-view-mode">
                  {viewModeLabel}
                </span>
                {isVeryLargeInput && (
                  <>
                    <span className="toolbar-separator">|</span>
                    <span className="toolbar-large-warning" role="alert">
                      Large input — diff may be slower
                    </span>
                  </>
                )}
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
