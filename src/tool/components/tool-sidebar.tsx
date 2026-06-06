'use client';

import { useMemo } from 'react';
import type { DiffLine } from '../types';

/** Props for the diff viewer sidebar panel. */
interface ToolSidebarProps {
  original: string;
  modified: string;
  viewMode: 'side-by-side' | 'unified' | 'split';
  showWhitespace: boolean;
  wordDiff: boolean;
  wrapLines: boolean;
  contextLines: number;
  ignoreWhitespace: boolean;
  /** Pre-computed full diff lines (without context filtering). */
  diffLines: DiffLine[];
  /** Optional pre-computed diff stats to avoid re-computing from diffLines. */
  diffStats?: { additions: number; deletions: number; changes: number };
  onShowWhitespaceChange?: (show: boolean) => void;
  onWordDiffChange?: (enabled: boolean) => void;
  onWrapLinesChange?: (enabled: boolean) => void;
  onContextLinesChange?: (lines: number) => void;
  onIgnoreWhitespaceChange?: (enabled: boolean) => void;
  onSwap?: () => void;
  onClear?: () => void;
  onCopyDiff?: () => void;
  onCopyJson?: () => void;
}

export function ToolSidebar({
  original,
  modified,
  viewMode,
  showWhitespace,
  wordDiff,
  wrapLines,
  contextLines,
  ignoreWhitespace,
  diffLines,
  diffStats: precomputedStats,
  onShowWhitespaceChange,
  onWordDiffChange,
  onWrapLinesChange,
  onContextLinesChange,
  onIgnoreWhitespaceChange,
  onSwap,
  onClear,
  onCopyDiff,
  onCopyJson,
}: ToolSidebarProps) {
  const origLines = original ? original.split('\n').length : 0;
  const modLines = modified ? modified.split('\n').length : 0;
  const origChars = original.length;
  const modChars = modified.length;

  // Compute diff stats from pre-computed diff lines (or use forwarded stats)
  const diffStats = useMemo(() => {
    if (precomputedStats) {
      return {
        additions: precomputedStats.additions,
        deletions: precomputedStats.deletions,
        changes: precomputedStats.additions + precomputedStats.deletions,
      };
    }
    if (!original && !modified) return { additions: 0, deletions: 0, changes: 0 };
    let additions = 0;
    let deletions = 0;
    for (const line of diffLines) {
      if (line.type === 'added') additions++;
      else if (line.type === 'removed') deletions++;
    }
    return { additions, deletions, changes: additions + deletions };
  }, [original, modified, diffLines, precomputedStats]);

  return (
    <div className="diff-sidebar" role="region" aria-label="Diff viewer settings">
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
            <div className="stat-row large-input-warning">
              Large input detected — diff may be slower
            </div>
          ) : null}
          <div className="stat-row stat-separator">
            <dt className="diff-stat-additions">Additions</dt>
            <dd className="diff-stat-additions">+{diffStats.additions.toLocaleString()}</dd>
          </div>
          <div className="stat-row">
            <dt className="diff-stat-deletions">Deletions</dt>
            <dd className="diff-stat-deletions">-{diffStats.deletions.toLocaleString()}</dd>
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
              aria-label="Show whitespace characters (spaces as ·, tabs as →)"
            />
            <span>Show Whitespace</span>
          </label>
        </div>

        <div className="sidebar-option-row">
          <label className="sidebar-checkbox-label">
            <input
              type="checkbox"
              checked={wordDiff}
              onChange={(e) => onWordDiffChange?.(e.target.checked)}
              aria-label="Enable word-level diff highlighting within changed lines"
            />
            <span>Word Diff</span>
          </label>
        </div>

        <div className="sidebar-option-row">
          <label className="sidebar-checkbox-label">
            <input
              type="checkbox"
              checked={wrapLines}
              onChange={(e) => onWrapLinesChange?.(e.target.checked)}
              aria-label="Wrap long lines instead of horizontal scrolling"
            />
            <span>Wrap Lines</span>
          </label>
        </div>

        <div className="sidebar-option-row">
          <label className="sidebar-checkbox-label">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(e) => onIgnoreWhitespaceChange?.(e.target.checked)}
              aria-label="Ignore whitespace-only changes when computing diff"
            />
            <span>Ignore Whitespace</span>
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
              aria-label={'Context lines: ' + contextLines}
            />
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <h3>Actions</h3>
        <div role="group" aria-label="Diff viewer actions">
          <button
            type="button"
            className="sidebar-action-btn"
            onClick={onSwap}
            disabled={!original && !modified}
            title={
              !original && !modified
                ? 'Paste text in a panel first'
                : 'Swap original ↔ modified (Ctrl+Shift+S)'
            }
            aria-label={
              !original && !modified
                ? 'Swap original and modified text (disabled)'
                : 'Swap original and modified text'
            }
          >
            Swap Original ↔ Modified
            <kbd className="tab-shortcut-hint" aria-hidden="true">
              Ctrl+Shift+S
            </kbd>
          </button>
          <button
            type="button"
            className="sidebar-action-btn sidebar-action-btn-danger"
            onClick={onClear}
            disabled={!original && !modified}
            title={
              !original && !modified
                ? 'Nothing to clear'
                : 'Clear both text panels (Ctrl+Shift+Backspace)'
            }
            aria-label={
              !original && !modified
                ? 'Clear both text panels (disabled)'
                : 'Clear both text panels'
            }
          >
            Clear Both
            <kbd className="tab-shortcut-hint" aria-hidden="true">
              Ctrl+Shift+⌫
            </kbd>
          </button>
          <button
            type="button"
            className="sidebar-action-btn"
            onClick={onCopyDiff}
            disabled={!original && !modified}
            title={!original && !modified ? 'Paste text first' : 'Copy unified diff to clipboard'}
            aria-label={
              !original && !modified
                ? 'Copy unified diff to clipboard (disabled)'
                : 'Copy unified diff to clipboard'
            }
          >
            Copy Unified Diff
            <kbd className="tab-shortcut-hint" aria-hidden="true">
              Ctrl+Shift+C
            </kbd>
          </button>
          <button
            type="button"
            className="sidebar-action-btn"
            onClick={onCopyJson}
            disabled={!original && !modified}
            title={
              !original && !modified ? 'Paste text first' : 'Copy state as JSON to clipboard (Ctrl+Shift+J)'
            }
            aria-label={
              !original && !modified
                ? 'Copy state as JSON to clipboard (disabled)'
                : 'Copy state as JSON to clipboard'
            }
          >
            Copy as JSON
            <kbd className="tab-shortcut-hint" aria-hidden="true">
              Ctrl+Shift+J
            </kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

ToolSidebar.displayName = 'ToolSidebar';
