'use client';

/** Props for the diff viewer toolbar. */
interface ToolToolbarProps {
  original: string;
  modified: string;
  viewMode: 'side-by-side' | 'unified' | 'split';
  /** Number of additions in the diff. */
  additions?: number;
  /** Number of deletions in the diff. */
  deletions?: number;
  /** Whether word-level diff highlighting is enabled. */
  wordDiff?: boolean;
  /** Whether whitespace visualization is enabled. */
  showWhitespace?: boolean;
}

export function ToolToolbar({
  original,
  modified,
  viewMode,
  additions = 0,
  deletions = 0,
  wordDiff = false,
  showWhitespace = false,
}: ToolToolbarProps) {
  const origLines = original ? original.split('\n').length : 0;
  const modLines = modified ? modified.split('\n').length : 0;
  const origChars = original.length;
  const modChars = modified.length;
  const showStats = Boolean(original || modified);

  const viewModeLabel =
    viewMode === 'side-by-side' ? 'Side-by-Side' : viewMode === 'unified' ? 'Unified' : 'Split';

  // Warning threshold below MAX_TEXT_LENGTH (500K) so users get feedback before truncation at the input boundary
  const LARGE_INPUT_THRESHOLD = 100_000;
  const isVeryLargeInput = origChars > LARGE_INPUT_THRESHOLD || modChars > LARGE_INPUT_THRESHOLD;

  const activeFlags = [];
  if (showWhitespace) activeFlags.push('WS');
  if (wordDiff) activeFlags.push('WD');

  return (
    <div className="diff-toolbar">
      <span className="toolbar-info-text">
        {showStats ? (
          <span className="toolbar-stats-group">
            <span title="Original lines / characters">
              <span className="diff-stat-deletions">−</span> {origLines}L /{' '}
              {origChars.toLocaleString()}C
            </span>
            <span className="toolbar-separator">|</span>
            <span title="Modified lines / characters">
              <span className="diff-stat-additions">+</span> {modLines}L /{' '}
              {modChars.toLocaleString()}C
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
            {activeFlags.length > 0 && (
              <>
                <span className="toolbar-separator">|</span>
                <span className="toolbar-active-flags" title="Active settings">
                  {activeFlags.join(', ')}
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
