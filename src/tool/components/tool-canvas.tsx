'use client';

import { useMemo } from 'react';
import type { DiffLine } from '../types';


/**
 * Compute a line-level diff between two texts using the Longest Common
 * Subsequence (LCS) algorithm. Returns an array of DiffLine objects
 * describing each line's type (added, removed, unchanged) and line numbers.
 *
 * When contextLines >= 0, unchanged lines far from any change are collapsed
 * into "..." markers to show only relevant context.
 * Pass contextLines = -1 to return the full diff without collapsing.
 */
function computeDiff(original: string, modified: string, contextLines: number): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  if (original === '' && modified === '') return [];
  if (original === '') {
    return modLines.map((line, i) => ({
      type: 'added' as const,
      oldLineNumber: null,
      newLineNumber: i + 1,
      content: line,
    }));
  }
  if (modified === '') {
    return origLines.map((line, i) => ({
      type: 'removed' as const,
      oldLineNumber: i + 1,
      newLineNumber: null,
      content: line,
    }));
  }

  // Simple LCS — guard against very large inputs to avoid OOM
  const m = origLines.length;
  const n = modLines.length;
  const LCS_MAX_CELLS = 10_000_000; // ~80 MB for number[][]
  if (m * n > LCS_MAX_CELLS) {
    // Fallback: line-by-line comparison without LCS for huge inputs
    const maxLen = Math.max(m, n);
    const result: DiffLine[] = [];
    for (let i = 0; i < maxLen; i++) {
      const ol = i < m ? origLines[i] : null;
      const ml = i < n ? modLines[i] : null;
      if (ol === null && ml !== null) {
        result.push({ type: 'added', oldLineNumber: null, newLineNumber: i + 1, content: ml as string });
      } else if (ol !== null && ml === null) {
        result.push({ type: 'removed', oldLineNumber: i + 1, newLineNumber: null, content: ol as string });
      } else if (ol !== ml) {
        result.push({ type: 'removed', oldLineNumber: i + 1, newLineNumber: null, content: ol as string });
        result.push({ type: 'added', oldLineNumber: null, newLineNumber: i + 1, content: ml as string });
      } else {
        result.push({ type: 'unchanged', oldLineNumber: i + 1, newLineNumber: i + 1, content: ol as string });
      }
    }
    return result;
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        dp[i]![j] = (dp[i - 1]![j - 1] as number) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j] as number, dp[i]![j - 1] as number);
      }
    }
  }

  // Backtrack
  const ops: { type: 'added' | 'removed' | 'unchanged'; oldIdx: number; newIdx: number }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      ops.push({ type: 'unchanged', oldIdx: i - 1, newIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || (dp[i]![j - 1] as number) >= (dp[i - 1]![j] as number))) {
      ops.push({ type: 'added', oldIdx: -1, newIdx: j - 1 });
      j--;
    } else if (i > 0) {
      ops.push({ type: 'removed', oldIdx: i - 1, newIdx: -1 });
      i--;
    }
  }
  ops.reverse();

  // Build output with line numbers
  let oldNum = 0, newNum = 0;
  const result: DiffLine[] = [];

  for (const op of ops) {
    if (op.type === 'unchanged') {
      oldNum++;
      newNum++;
      result.push({
        type: 'unchanged',
        oldLineNumber: oldNum,
        newLineNumber: newNum,
        content: origLines[op.oldIdx] as string,
      });
    } else if (op.type === 'added') {
      newNum++;
      result.push({
        type: 'added',
        oldLineNumber: null,
        newLineNumber: newNum,
        content: modLines[op.newIdx] as string,
      });
    } else if (op.type === 'removed') {
      oldNum++;
      result.push({
        type: 'removed',
        oldLineNumber: oldNum,
        newLineNumber: null,
        content: origLines[op.oldIdx] as string,
      });
    }
  }

  // Apply context lines filtering
  if (contextLines < 0) return result;

  const changedIndices = new Set<number>();
  for (let idx = 0; idx < result.length; idx++) {
    if ((result[idx] as DiffLine).type !== 'unchanged') {
      for (let c = -contextLines; c <= contextLines; c++) {
        const ci = idx + c;
        if (ci >= 0 && ci < result.length) {
          changedIndices.add(ci);
        }
      }
    }
  }

  const filtered: DiffLine[] = [];
  let lastIncluded = -1;
  for (let idx = 0; idx < result.length; idx++) {
    if (changedIndices.has(idx)) {
      if (lastIncluded >= 0 && idx - lastIncluded > 1) {
        filtered.push({
          type: 'unchanged',
          oldLineNumber: null,
          newLineNumber: null,
          content: '...',
        });
      }
      filtered.push(result[idx] as DiffLine);
      lastIncluded = idx;
    }
  }

  return filtered;
}

/** Props for the main diff viewer canvas component. */
interface ToolCanvasProps {
  original: string;
  modified: string;
  viewMode: 'side-by-side' | 'unified' | 'split';
  showWhitespace: boolean;
  contextLines: number;
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  onOriginalChange?: (text: string) => void;
  onModifiedChange?: (text: string) => void;
  onViewModeChange?: (mode: 'side-by-side' | 'unified' | 'split') => void;
}

/** Renders a single line in the unified/split diff view with line numbers and type indicator. */
function DiffLineRow({
  line,
  showWhitespace,
}: {
  line: DiffLine;
  showWhitespace: boolean;
}) {
  const displayContent = showWhitespace
    ? line.content
        .replace(/ /g, '\u00B7')
        .replace(/\t/g, '\u2192   ')
    : line.content;

  const isHunk = line.content === '...';
  const bgColor =
    line.type === 'added'
      ? 'rgba(34, 197, 94, 0.1)'
      : line.type === 'removed'
        ? 'rgba(239, 68, 68, 0.1)'
        : isHunk
          ? 'var(--card)'
          : 'transparent';

  const borderColor =
    line.type === 'added'
      ? 'rgba(34, 197, 94, 0.3)'
      : line.type === 'removed'
        ? 'rgba(239, 68, 68, 0.3)'
        : 'transparent';

  return (
    <div
      className="diff-line"
      style={{
        display: 'flex',
        fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
        fontSize: '0.8125rem',
        lineHeight: '1.6',
        background: bgColor,
        borderLeft: `3px solid ${borderColor}`,
        minHeight: '1.6em',
      }}
    >
      <span
        className="diff-line-number-old"
        style={{
          width: '48px',
          minWidth: '48px',
          textAlign: 'right',
          paddingRight: '8px',
          color: 'var(--muted)',
          userSelect: 'none',
          fontSize: '0.75rem',
          borderRight: '1px solid var(--border)',
          opacity: line.oldLineNumber ? 1 : 0.4,
        }}
      >
        {line.oldLineNumber ?? ''}
      </span>
      <span
        className="diff-line-sign"
        style={{
          width: '20px',
          minWidth: '20px',
          textAlign: 'center',
          color:
            line.type === 'added'
              ? 'var(--success)'
              : line.type === 'removed'
                ? 'var(--error)'
                : 'var(--muted)',
          userSelect: 'none',
        }}
      >
        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : isHunk ? '~' : ' '}
      </span>
      <span
        className="diff-line-content"
        style={{
          flex: 1,
          paddingLeft: '8px',
          whiteSpace: 'pre',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: isHunk ? 'var(--muted)' : undefined,
          fontStyle: isHunk ? 'italic' : undefined,
        }}
      >
        {displayContent || '\u00A0'}
      </span>
    </div>
  );
}

/** Main canvas component for the diff viewer. Renders side-by-side, unified, or split view. */
export function ToolCanvas({
  original,
  modified,
  viewMode,
  showWhitespace,
  contextLines,
  canvasRef,
  onOriginalChange,
  onModifiedChange,
  onViewModeChange,
}: ToolCanvasProps) {
  const diffLines = useMemo(
    () => computeDiff(original, modified, viewMode === 'unified' ? contextLines : -1),
    [original, modified, viewMode, contextLines],
  );

  const origNumLines = original.split('\n').length || 1;
  const modNumLines = modified.split('\n').length || 1;

  const renderSideBySide = () => (
    <div className="diff-side-by-side" style={{ display: 'flex', gap: 0, height: '100%' }}>
      {/* Original Panel */}
      <div
        className="diff-panel diff-panel-original"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}
      >
        <div
          className="diff-panel-header"
          style={{
            padding: '0.5rem 0.75rem',
            fontWeight: 600,
            fontSize: '0.8125rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ color: 'var(--error)' }}>−</span> Original ({origNumLines} lines)
        </div>
        <textarea
          className="diff-textarea"
          value={original}
          onChange={(e) => onOriginalChange?.(e.target.value)}
          placeholder="Paste original text here..."
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            padding: '0.75rem',
            fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
            fontSize: '0.8125rem',
            lineHeight: '1.6',
            border: 'none',
            background: 'transparent',
            color: 'var(--foreground)',
            resize: 'none',
            outline: 'none',
          }}
          aria-label="Original text"
        />
      </div>

      {/* Modified Panel */}
      <div
        className="diff-panel diff-panel-modified"
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        <div
          className="diff-panel-header"
          style={{
            padding: '0.5rem 0.75rem',
            fontWeight: 600,
            fontSize: '0.8125rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ color: 'var(--success)' }}>+</span> Modified ({modNumLines} lines)
        </div>
        <textarea
          className="diff-textarea"
          value={modified}
          onChange={(e) => onModifiedChange?.(e.target.value)}
          placeholder="Paste modified text here..."
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            padding: '0.75rem',
            fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
            fontSize: '0.8125rem',
            lineHeight: '1.6',
            border: 'none',
            background: 'transparent',
            color: 'var(--foreground)',
            resize: 'none',
            outline: 'none',
          }}
          aria-label="Modified text"
        />
      </div>
    </div>
  );

  const renderUnified = () => (
    <div className="diff-unified" style={{ height: '100%', overflowY: 'auto' }}>
      <div
        className="diff-unified-header"
        style={{
          padding: '0.5rem 0.75rem',
          fontWeight: 600,
          fontSize: '0.8125rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <span>Unified Diff View</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          {diffLines.filter((l) => l.type === 'added').length} additions,{' '}
          {diffLines.filter((l) => l.type === 'removed').length} deletions
        </span>
      </div>
      <div className="diff-lines-container" style={{ padding: '0.25rem 0' }}>
        {diffLines.length === 0 ? (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '0.875rem',
            }}
          >
            Paste text in both panels to see the diff
          </div>
        ) : (
          diffLines.map((line, idx) => (
            <DiffLineRow key={idx} line={line} showWhitespace={showWhitespace} />
          ))
        )}
      </div>
    </div>
  );

  const renderSplit = () => (
    <div className="diff-split" style={{ display: 'flex', gap: 0, height: '100%' }}>
      {/* Left: Editor */}
      <div
        className="diff-split-editor"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}
      >
        <div
          className="diff-split-header"
          style={{
            padding: '0.5rem 0.75rem',
            fontWeight: 600,
            fontSize: '0.8125rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ color: 'var(--error)' }}>−</span> Original
        </div>
        <textarea
          className="diff-textarea"
          value={original}
          onChange={(e) => onOriginalChange?.(e.target.value)}
          placeholder="Paste original text..."
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            padding: '0.75rem',
            fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
            fontSize: '0.8125rem',
            lineHeight: '1.6',
            border: 'none',
            background: 'transparent',
            color: 'var(--foreground)',
            resize: 'none',
            outline: 'none',
          }}
          aria-label="Original text"
        />
      </div>

      {/* Right: Diff Output */}
      <div
        className="diff-split-output"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
      >
        <div
          className="diff-split-header"
          style={{
            padding: '0.5rem 0.75rem',
            fontWeight: 600,
            fontSize: '0.8125rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            position: 'sticky',
            top: 0,
          }}
        >
          <span>Diff Output</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {diffLines.filter((l) => l.type === 'added').length}+,{' '}
            {diffLines.filter((l) => l.type === 'removed').length}-
          </span>
        </div>
        <div style={{ padding: '0.25rem 0' }}>
          {diffLines.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '0.875rem',
              }}
            >
              Diff will appear here
            </div>
          ) : (
            diffLines.map((line, idx) => (
              <DiffLineRow key={idx} line={line} showWhitespace={showWhitespace} />
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={canvasRef}
      className="diff-canvas"
      role="application"
      aria-label="Diff Viewer"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* View Mode Tabs */}
      <div
        className="diff-mode-tabs"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
        }}
      >
        {(['side-by-side', 'unified', 'split'] as const).map((mode) => (
          <TabButton
            key={mode}
            active={viewMode === mode}
            label={mode === 'side-by-side' ? 'Side-by-Side' : mode === 'unified' ? 'Unified' : 'Split'}
            shortcut={mode === 'side-by-side' ? 'Ctrl+1' : mode === 'unified' ? 'Ctrl+2' : 'Ctrl+3'}
            onClick={() => onViewModeChange?.(mode)}
          />
        ))}
      </div>

      {/* Diff Content */}
      <div className="diff-content" style={{ flex: 1, overflow: 'hidden' }}>
        {viewMode === 'side-by-side' && renderSideBySide()}
        {viewMode === 'unified' && renderUnified()}
        {viewMode === 'split' && renderSplit()}
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  shortcut,
  onClick,
}: {
  active: boolean;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="diff-tab-button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: '0.5rem 1rem',
        fontSize: '0.8125rem',
        fontWeight: active ? 600 : 400,
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--muted)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {label}
      {shortcut && (
        <kbd
          style={{
            fontSize: '0.65rem',
            padding: '1px 4px',
            background: 'var(--background)',
            borderRadius: '3px',
            border: '1px solid var(--border)',
            opacity: 0.6,
          }}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
