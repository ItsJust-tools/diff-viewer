'use client';

import { useMemo } from 'react';

/** Status and context information shown in the diff viewer toolbar. */
interface ToolToolbarProps {
  /** The original (left/old) text content. */
  original: string;
  /** The modified (right/new) text content. */
  modified: string;
  /** Currently active view mode for displaying the diff. */
  viewMode: 'side-by-side' | 'unified' | 'split';
  /** Number of addition lines detected in the computed diff. */
  additions?: number;
  /** Number of deletion lines detected in the computed diff. */
  deletions?: number;
}

/**
 * Displays toolbar stats and context information for the diff viewer.
 * Shows line/character counts for original and modified texts,
 * computed diff stats (additions/deletions), and the current view mode.
 * Automatically detects large inputs (>500K chars) and shows a warning.
 */
export function ToolToolbar({
  original,
  modified,
  viewMode,
  additions = 0,
  deletions = 0,
}: ToolToolbarProps) {
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
    stats && (stats.origChars > LARGE_INPUT_THRESHOLD || stats.modChars > LARGE_INPUT_THRESHOLD);

  return (
    <div className="diff-toolbar">
      <span className="toolbar-info-text">
        {original || modified ? (
          <span className="toolbar-stats-group">
            <span title="Original lines / characters">
              <span className="diff-stat-deletions">−</span> {stats!.origLines}L /{' '}
              {stats!.origChars.toLocaleString()}C
            </span>
            <span className="toolbar-separator">|</span>
            <span title="Modified lines / characters">
              <span className="diff-stat-additions">+</span> {stats!.modLines}L /{' '}
              {stats!.modChars.toLocaleString()}C
            </span>
            {(additions > 0 || deletions > 0) && (
              <>
                <span className="toolbar-separator">|</span>
                <span title="Diff changes">
                  <span className="diff-stat-additions">+{additions}</span>
                  {' / '}
                  <span className="diff-stat-deletions">-{deletions}</span>
                </span>
              </>
            )}
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
        ) : (
          'Paste text in both panels to compare'
        )}
      </span>
    </div>
  );
}

ToolToolbar.displayName = 'ToolToolbar';
