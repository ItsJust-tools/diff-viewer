'use client';

import { useMemo } from 'react';
import type { DiffLine, WordChange, DiffOp } from '../types';

/**
 * Compute the Longest Common Subsequence (LCS) between two arrays of strings
 * using dynamic programming with a compact flat-buffer representation.
 *
 * Returns a flat Uint32Array of size (m+1) × (n+1) for backtracking.
 * The cell at index i*(n+1)+j holds the LCS length for a[0..i-1] and b[0..j-1].
 *
 * Time: O(m×n) | Space: O(m×n) in a single Uint16Array (~2 bytes per cell).
 * This is ~8× more memory-efficient than a number[][] and avoids allocation
 * of m+1 separate arrays.
 *
 * A soft guard prevents OOM on huge inputs.
 *
 * Note: this uses Uint32Array (not Uint16Array) because LCS lengths can
 * exceed 65535 for large inputs. For example, comparing two ~1000-token
 * lines at the word level can need LCS values well above 65535.
 */
function computeLCSTable(a: string[], b: string[]): Uint32Array {
  const m = a.length;
  const n = b.length;
  const stride = n + 1;
  const size = (m + 1) * stride;
  // Use Uint32Array (not Uint16Array) because LCS lengths can exceed
  // 65535 for large inputs (e.g., word-level diffs with many tokens).
  // Uint16Array would silently overflow, producing incorrect diff output.
  const dp = new Uint32Array(size);
  for (let i = 1; i <= m; i++) {
    const base = i * stride;
    const prevBase = base - stride;
    const aVal = a[i - 1] as string;
    for (let j = 1; j <= n; j++) {
      if (aVal === b[j - 1]) {
        dp[base + j] = (dp[prevBase + j - 1] as number) + 1;
      } else {
        const up = dp[prevBase + j] as number;
        const left = dp[base + j - 1] as number;
        dp[base + j] = up > left ? up : left;
      }
    }
  }
  return dp;
}

/**
 * Backtrack through an LCS DP table to produce a sequence of DiffOps
 * (added, removed, unchanged) that transform string `a` into string `b`.
 */
function backtrackDiff(a: string[], b: string[], dp: Uint32Array): DiffOp[] {
  const n = b.length;
  const stride = n + 1;
  const ops: DiffOp[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'unchanged', oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (
      j > 0 &&
      (i === 0 || (dp[i * stride + j - 1] as number) >= (dp[(i - 1) * stride + j] as number))
    ) {
      ops.push({ type: 'added', oldIdx: -1, newIdx: j - 1 });
      j--;
    } else if (i > 0) {
      ops.push({ type: 'removed', oldIdx: i - 1, newIdx: -1 });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

/**
 * Split text into tokens for word-level diff.
 * Matches runs of non-whitespace characters and runs of whitespace as separate tokens.
 * This preserves spacing changes between words as visible tokens.
 *
 * Note: CJK characters and other non-whitespace-delimited scripts are treated as
 * single continuous tokens, which means word-level highlighting won't distinguish
 * individual characters in such scripts. This is a known limitation.
 *
 * @param text - The single-line text to tokenize
 * @returns Array of non-empty string tokens, or `null` if text is empty
 */
function tokenize(text: string): string[] {
  // Match word characters, whitespace runs, or individual non-whitespace/non-word chars
  return text.match(/[^\s]+|\s+/g) ?? [];
}

/**
 * Compute a word-level diff between two single-line strings.
 * Returns an array of segments with their type (added/removed/unchanged).
 */
function computeWordDiff(
  oldLine: string,
  newLine: string,
  type: 'added' | 'removed'
): WordChange[] {
  if (oldLine === newLine) {
    return [{ type: 'unchanged', text: oldLine }];
  }

  const oldTokens = tokenize(oldLine);
  const newTokens = tokenize(newLine);

  // If either side is empty or both are single tokens, just return the full line
  if (oldTokens.length === 0) {
    return [{ type, text: newLine }];
  }
  if (newTokens.length === 0) {
    return [{ type, text: oldLine }];
  }

  // Use a simplified LCS on tokens for word-level diff.
  // Guard against huge token counts.
  if (oldTokens.length * newTokens.length > 10_000) {
    return [{ type, text: type === 'added' ? newLine : oldLine }];
  }

  const dp = computeLCSTable(oldTokens, newTokens);
  const ops = backtrackDiff(oldTokens, newTokens, dp);

  const result: WordChange[] = [];
  for (const op of ops) {
    const text =
      op.type === 'added'
        ? newTokens[op.newIdx]
        : op.type === 'removed'
          ? oldTokens[op.oldIdx]
          : oldTokens[op.oldIdx];
    if (text === undefined) continue;
    // For an 'added' line, 'removed' tokens in the word diff represent
    // tokens from the original that we want to show as removed context.
    // For a 'removed' line, 'added' tokens represent tokens from the new
    // version that are missing.
    // Normalize: for added lines, only emit 'added' and 'unchanged';
    // for removed lines, only emit 'removed' and 'unchanged'.
    const mappedType =
      type === 'added' && op.type === 'removed'
        ? ('removed' as const)
        : type === 'removed' && op.type === 'added'
          ? ('added' as const)
          : op.type === 'added'
            ? ('added' as const)
            : op.type === 'removed'
              ? ('removed' as const)
              : ('unchanged' as const);

    // Merge consecutive segments of the same type
    const last = result[result.length - 1];
    if (last && last.type === mappedType) {
      last.text += text;
    } else {
      result.push({ type: mappedType, text });
    }
  }

  return result;
}

// ---- Shared Helpers (used by both canonical and chunked diff paths) ----

/**
 * Convert an array of DiffOps into an array of DiffLine objects with
 * sequential line numbers, resolving each op against the original line
 * arrays.
 */
function buildDiffLinesFromOps(ops: DiffOp[], origLines: string[], modLines: string[]): DiffLine[] {
  let oldNum = 0,
    newNum = 0;
  const result: DiffLine[] = [];
  for (const op of ops) {
    if (op.type === 'unchanged') {
      oldNum++;
      newNum++;
      result.push({
        type: 'unchanged',
        oldLineNumber: oldNum,
        newLineNumber: newNum,
        content: origLines[op.oldIdx] ?? '',
      });
    } else if (op.type === 'added') {
      newNum++;
      result.push({
        type: 'added',
        oldLineNumber: null,
        newLineNumber: newNum,
        content: modLines[op.newIdx] ?? '',
      });
    } else if (op.type === 'removed') {
      oldNum++;
      result.push({
        type: 'removed',
        oldLineNumber: oldNum,
        newLineNumber: null,
        content: origLines[op.oldIdx] ?? '',
      });
    }
  }
  return result;
}

/**
 * Walk through DiffLine array and pair each removed line with the nearest
 * subsequent added line to compute word-level diff highlighting.
 * Mutates the passed array in-place by attaching {@link DiffLine.wordChanges}.
 */
function applyWordDiffPairing(result: DiffLine[]): void {
  // Collect consecutive removed lines, then pair them with consecutive added lines.
  // This handles multi-line changes where several removed lines are followed by
  // several added lines, pairing them in order (1st removed ↔ 1st added, etc.).
  const pendingRemoved: { idx: number; content: string }[] = [];
  for (let i = 0; i < result.length; i++) {
    const line = result[i] as DiffLine;
    if (line.type === 'removed') {
      pendingRemoved.push({ idx: i, content: line.content });
    } else if (line.type === 'added' && pendingRemoved.length > 0) {
      // Pair the first pending removed line with this added line (FIFO order)
      const removedLine = pendingRemoved.shift()!;
      const newLine = line.content;
      result[removedLine.idx]!.wordChanges = computeWordDiff(
        removedLine.content,
        newLine,
        'removed'
      );
      line.wordChanges = computeWordDiff(removedLine.content, newLine, 'added');
    } else if (line.type !== 'unchanged') {
      pendingRemoved.length = 0;
    }
  }
}

/**
 * Filter a full diff result to only keep lines within `contextLines` of any
 * change. Inserts hunk-marker lines (`@@ -... +... @@` or `...`) as
 * separators between collapsed unchanged regions.
 */
function filterContextLines(result: DiffLine[], contextLines: number): DiffLine[] {
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
        const prevLine = result[lastIncluded] as DiffLine;
        const nextLine = result[idx] as DiffLine;
        const startOld = prevLine.oldLineNumber != null ? prevLine.oldLineNumber + 1 : null;
        const startNew = prevLine.newLineNumber != null ? prevLine.newLineNumber + 1 : null;
        const endOld = nextLine.oldLineNumber != null ? nextLine.oldLineNumber - 1 : null;
        const endNew = nextLine.newLineNumber != null ? nextLine.newLineNumber - 1 : null;

        let hunkLabel = '...';
        if (startOld != null && endOld != null && startNew != null && endNew != null) {
          hunkLabel = `@@ -${startOld},${endOld - startOld + 1} +${startNew},${endNew - startNew + 1} @@`;
        }

        filtered.push({
          type: 'unchanged',
          oldLineNumber: startOld,
          newLineNumber: startNew,
          content: hunkLabel,
        });
      }
      filtered.push(result[idx] as DiffLine);
      lastIncluded = idx;
    }
  }

  return filtered;
}

/**
 * Chunked LCS diff for very large inputs where the full DP table would exceed
 * memory limits (~80 MB). Splits the input into overlapping chunks, computes
 * LCS within each chunk, and stitches the results together.
 *
 * Overlap between chunks ensures that lines matching across chunk boundaries
 * are correctly detected, avoiding spurious add/remove pairs at chunk seams.
 * Only the non-overlapping "leading" portion of each chunk's result is emitted;
 * the overlap region provides context for the LCS but its ops are discarded
 * (they were already emitted by the previous chunk).
 *
 * This produces substantially better diffs than a naive positional fallback
 * when lines have shifted, while still avoiding OOM.
 *
 * @param origLines - Original text split into lines
 * @param modLines - Modified text split into lines
 * @param contextLines - Context lines for filtering (-1 for no filtering)
 * @param enableWordDiff - When true, compute word-level diff highlighting for changed lines
 * @param ignoreWhitespace - When true, trim lines before LCS comparison
 * @returns Array of DiffLine objects
 */
function computeDiffChunked(
  origLines: string[],
  modLines: string[],
  contextLines: number,
  enableWordDiff = true,
  ignoreWhitespace = false
): DiffLine[] {
  const CHUNK_SIZE = 2000; // 2000×2000 = 4M cells, well under 10M limit
  const OVERLAP = 50; // overlap between chunks to catch boundary matches
  const STEP = CHUNK_SIZE - OVERLAP; // how far we advance each iteration
  const totalOrig = origLines.length;
  const totalMod = modLines.length;

  const allOps: DiffOp[] = [];
  let origOffset = 0;
  let modOffset = 0;

  while (origOffset < totalOrig || modOffset < totalMod) {
    const origEnd = Math.min(origOffset + CHUNK_SIZE, totalOrig);
    const modEnd = Math.min(modOffset + CHUNK_SIZE, totalMod);
    const chunkOrig = origLines.slice(origOffset, origEnd);
    const chunkMod = modLines.slice(modOffset, modEnd);

    if (chunkOrig.length === 0 && chunkMod.length === 0) break;

    // If only one side has remaining lines, they're all adds/removes
    if (chunkOrig.length === 0) {
      for (let i = 0; i < chunkMod.length; i++) {
        allOps.push({ type: 'added', oldIdx: -1, newIdx: modOffset + i });
      }
      modOffset = modEnd;
      continue;
    }
    if (chunkMod.length === 0) {
      for (let i = 0; i < chunkOrig.length; i++) {
        allOps.push({ type: 'removed', oldIdx: origOffset + i, newIdx: -1 });
      }
      origOffset = origEnd;
      continue;
    }

    // When ignoring whitespace, compute LCS on trimmed lines but display
    // the original (untrimmed) content. This way whitespace-only changes
    // are hidden from the diff while preserving actual text for display.
    const compareChunkOrig = ignoreWhitespace
      ? chunkOrig.map((l) => l.trim())
      : chunkOrig;
    const compareChunkMod = ignoreWhitespace
      ? chunkMod.map((l) => l.trim())
      : chunkMod;

    const dp = computeLCSTable(compareChunkOrig, compareChunkMod);
    const chunkOps = backtrackDiff(compareChunkOrig, compareChunkMod, dp);

    // Determine the boundary for this chunk's "committed" region.
    // The committed region is the first STEP lines of this chunk (or all
    // remaining lines for the last chunk). The overlap region (last OVERLAP
    // lines) is only used as context for the LCS and its ops are discarded.
    const isLastOrigChunk = origEnd >= totalOrig;
    const isLastModChunk = modEnd >= totalMod;
    const commitOrigEnd = isLastOrigChunk ? totalOrig : origOffset + STEP;
    const commitModEnd = isLastModChunk ? totalMod : modOffset + STEP;

    for (const op of chunkOps) {
      const globalOldIdx = op.oldIdx >= 0 ? origOffset + op.oldIdx : -1;
      const globalNewIdx = op.newIdx >= 0 ? modOffset + op.newIdx : -1;

      // Only emit ops whose indices fall within the committed region.
      // An op is committed if at least one of its indices is in the committed
      // region (the first STEP lines of this chunk). The overlap region
      // (last OVERLAP lines) is only used as context for the LCS.
      const oldCommitted = globalOldIdx < 0 || globalOldIdx < commitOrigEnd;
      const newCommitted = globalNewIdx < 0 || globalNewIdx < commitModEnd;
      if (!oldCommitted && !newCommitted) continue;

      allOps.push({
        type: op.type,
        oldIdx: globalOldIdx,
        newIdx: globalNewIdx,
      });
    }

    origOffset = Math.min(origOffset + STEP, totalOrig);
    modOffset = Math.min(modOffset + STEP, totalMod);
  }

  const result = buildDiffLinesFromOps(allOps, origLines, modLines);

  if (enableWordDiff) {
    applyWordDiffPairing(result);
  }

  return filterContextLines(result, contextLines);
}

/**
 * Filter a pre-computed diff (produced by {@link computeRawDiff}) with the
 * given context lines. This is a lightweight operation compared to re-running
 * the full LCS — ideal when you need multiple filtered views of the same diff.
 *
 * When contextLines >= 0, unchanged lines far from any change are collapsed
 * into "..." markers to show only relevant context.
 * Pass contextLines = -1 to return the full diff without collapsing.
 */
export function filterDiffLines(diffLines: DiffLine[], contextLines: number): DiffLine[] {
  if (contextLines < 0) return diffLines;
  // If there are no changed lines, the filtered result is always empty
  if (!diffLines.some((l) => l.type !== 'unchanged')) return [];
  return filterContextLines(diffLines, contextLines);
}

/**
 * Compute a full (unfiltered) line-level diff between two texts using the
 * Longest Common Subsequence (LCS) algorithm. Returns an array of DiffLine
 * objects describing each line's type (added, removed, unchanged) and line
 * numbers, without collapsing unchanged regions.
 *
 * For changed lines, word-level diff highlighting is computed (when
 * `enableWordDiff` is true and the corresponding paired line exists).
 * Skipping word-diff when it's not needed avoids expensive tokenization
 * for large diffs on every keystroke.
 *
 * When `ignoreWhitespace` is true, leading/trailing whitespace differences
 * are ignored during comparison — lines differing only in indentation or
 * trailing spaces are treated as unchanged. The original text is always
 * preserved for display.
 *
 * To get a context-filtered view, pass the result through {@link filterDiffLines}
 * instead of calling this function again with different contextLines.
 * This avoids redundant LCS computation.
 */
export function computeRawDiff(
  original: string,
  modified: string,
  enableWordDiff = true,
  ignoreWhitespace = false
): DiffLine[] {
  // Fast path: if the strings are identical, skip LCS entirely.
  // This is a common pattern when users are typing in one panel and
  // haven't changed the other yet, or when they paste the same text twice.
  if (original === modified) {
    const origLines = original.split('\n');
    return origLines.map((line, i) => ({
      type: 'unchanged' as const,
      oldLineNumber: i + 1,
      newLineNumber: i + 1,
      content: line,
    }));
  }

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

  // When ignoring whitespace, compute LCS on trimmed lines but display
  // the original (untrimmed) content. This way whitespace-only changes
  // are hidden from the diff while preserving actual text for display.
  const compareOrig: string[] = ignoreWhitespace ? origLines.map((l) => l.trim()) : origLines;
  const compareMod: string[] = ignoreWhitespace ? modLines.map((l) => l.trim()) : modLines;

  // Simple LCS — guard against very large inputs to avoid OOM
  const m = compareOrig.length;
  const n = compareMod.length;
  // ~80 MB for Uint32Array (~4 bytes per cell) at 20M cells
  const LCS_MAX_CELLS = 20_000_000;
  if (m * n > LCS_MAX_CELLS) {
    // Chunked path always produces the full unfiltered diff
    return computeDiffChunked(origLines, modLines, -1, enableWordDiff, ignoreWhitespace);
  }

  const dp = computeLCSTable(compareOrig, compareMod);
  const ops = backtrackDiff(compareOrig, compareMod, dp);

  const result = buildDiffLinesFromOps(ops, origLines, modLines);

  if (enableWordDiff) {
    applyWordDiffPairing(result);
  }

  return result;
}

/**
 * Compute a line-level diff between two texts using the Longest Common
 * Subsequence (LCS) algorithm. Returns an array of DiffLine objects
 * describing each line's type (added, removed, unchanged) and line numbers.
 *
 * When contextLines >= 0, unchanged lines far from any change are collapsed
 * into "..." markers to show only relevant context.
 * Pass contextLines = -1 to return the full diff without collapsing.
 *
 * For changed lines, word-level diff highlighting is computed (when
 * `enableWordDiff` is true and the corresponding paired line exists).
 * Skipping word-diff when it's not needed avoids expensive tokenization
 * for large diffs on every keystroke.
 *
 * This is a convenience wrapper around {@link computeRawDiff} + {@link filterDiffLines}.
 * For performance-sensitive callers that need both the full and filtered diff,
 * call computeRawDiff once and call filterDiffLines for each filtered view.
 */
export function computeDiff(
  original: string,
  modified: string,
  contextLines: number,
  enableWordDiff = true,
  ignoreWhitespace = false
): DiffLine[] {
  const raw = computeRawDiff(original, modified, enableWordDiff, ignoreWhitespace);
  return filterDiffLines(raw, contextLines);
}

/**
 * Generate a unified-diff formatted string from two texts.
 * Uses the same LCS algorithm as the diff view for consistent output.
 *
 * When `diffLines` is provided (pre-computed full diff from {@link computeRawDiff}),
 * it avoids re-computing the LCS, which is a significant optimization for large inputs.
 * Without `diffLines`, a full LCS pass is performed via {@link computeRawDiff} directly
 * (bypassing the unnecessary context-line filtering layer of {@link computeDiff}).
 */
export function generateUnifiedDiffString(
  original: string,
  modified: string,
  diffLines?: DiffLine[],
  ignoreWhitespace = false
): string {
  if (!original && !modified) return '';
  if (!original) {
    return modified
      .split('\n')
      .map((line) => `+${line}`)
      .join('\n');
  }
  if (!modified) {
    return original
      .split('\n')
      .map((line) => `-${line}`)
      .join('\n');
  }

  // Use pre-computed diff lines when available to avoid re-computing LCS
  const diffLines_ = diffLines ?? computeRawDiff(original, modified, false, ignoreWhitespace);
  const m = original.split('\n').length;
  const n = modified.split('\n').length;

  const result: string[] = [];
  result.push(`--- original`);
  result.push(`+++ modified`);
  result.push(`@@ -1,${m} +1,${n} @@`);

  for (const line of diffLines_) {
    if (line.type === 'added') {
      result.push(`+${line.content}`);
    } else if (line.type === 'removed') {
      result.push(`-${line.content}`);
    } else {
      result.push(` ${line.content}`);
    }
  }

  return result.join('\n');
}

/** Props for the main diff viewer canvas component. */
interface ToolCanvasProps {
  original: string;
  modified: string;
  viewMode: 'side-by-side' | 'unified' | 'split';
  showWhitespace: boolean;
  contextLines: number;
  wordDiff: boolean;
  wrapLines: boolean;
  /** Pre-computed full diff lines (without context filtering). */
  diffLines: DiffLine[];
  /** Pre-filtered diff lines for unified view (avoids redundant LCS computation). */
  filteredDiffLines?: DiffLine[];
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  onOriginalChange?: (text: string) => void;
  onModifiedChange?: (text: string) => void;
  onViewModeChange?: (mode: 'side-by-side' | 'unified' | 'split') => void;
}

/**
 * Renders the content of a diff line, optionally with word-level highlighting.
 * When wordChanges are present, renders each segment with inline highlighting.
 */
function DiffLineContent({
  line,
  showWhitespace,
  wordDiff,
}: {
  line: DiffLine;
  showWhitespace: boolean;
  wordDiff: boolean;
}) {
  const isHunk = line.type === 'unchanged' && line.content.startsWith('@@');

  // For hunk headers, render as-is
  if (isHunk) {
    const displayContent = showWhitespace
      ? line.content.replace(/ /g, '\u00B7').replace(/\t/g, '\u2192   ')
      : line.content;
    return <span className="diff-hunk-header">{displayContent}</span>;
  }

  // For the plain '...' hunk marker
  if (line.content === '...') {
    return <span className="diff-hunk-ellipsis">...</span>;
  }

  // Word-level diff highlighting for changed lines (only when wordDiff is enabled)
  if (
    wordDiff &&
    line.wordChanges &&
    line.wordChanges.length > 0 &&
    (line.type === 'added' || line.type === 'removed')
  ) {
    return (
      <>
        {line.wordChanges.map((seg, i) => {
          const segText = showWhitespace
            ? seg.text.replace(/ /g, '\u00B7').replace(/\t/g, '\u2192   ')
            : seg.text;
          if (seg.type === 'unchanged') {
            return <span key={i}>{segText}</span>;
          }
          const wordClass = seg.type === 'added' ? 'diff-word-added' : 'diff-word-removed';
          return (
            <span key={i} className={wordClass}>
              {segText || '\u00A0'}
            </span>
          );
        })}
      </>
    );
  }

  // Default rendering for unchanged lines or lines without word diff
  const displayContent = showWhitespace
    ? line.content.replace(/ /g, '\u00B7').replace(/\t/g, '\u2192   ')
    : line.content;

  return <>{displayContent || '\u00A0'}</>;
}

DiffLineContent.displayName = 'DiffLineContent';

/** Renders a single line in the unified/split diff view with line numbers and type indicator. */
function DiffLineRow({
  line,
  showWhitespace,
  wordDiff,
}: {
  line: DiffLine;
  showWhitespace: boolean;
  wordDiff: boolean;
}) {
  const isHunk = line.type === 'unchanged' && line.content.startsWith('@@');

  const rowClass =
    line.type === 'added'
      ? 'diff-line-row-added'
      : line.type === 'removed'
        ? 'diff-line-row-removed'
        : isHunk
          ? 'diff-line-row-hunk'
          : '';

  const oldNumClass = line.oldLineNumber != null ? 'line-num-present' : 'line-num-missing';
  const newNumClass = line.newLineNumber != null ? 'line-num-present' : 'line-num-missing';

  const signClass =
    line.type === 'added'
      ? 'diff-line-sign-added'
      : line.type === 'removed'
        ? 'diff-line-sign-removed'
        : 'diff-line-sign-hunk';

  const sign = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : isHunk ? '~' : ' ';

  const rowLabel =
    line.type === 'added'
      ? 'Added line'
      : line.type === 'removed'
        ? 'Removed line'
        : isHunk
          ? 'Hunk header'
          : 'Unchanged line';

  return (
    <div
      className={`diff-line diff-line-${line.type}${rowClass ? ' ' + rowClass : ''}`}
      role="row"
      aria-label={rowLabel}
    >
      <span
        className={`diff-line-number-old ${oldNumClass}`}
        aria-hidden={line.oldLineNumber == null}
      >
        {line.oldLineNumber != null ? line.oldLineNumber : '\u00B7'}
      </span>
      <span
        className={`diff-line-number-new ${newNumClass}`}
        aria-hidden={line.newLineNumber == null}
      >
        {line.newLineNumber != null ? line.newLineNumber : '\u00B7'}
      </span>
      <span className={`diff-line-sign ${signClass}`} aria-hidden>
        {sign}
      </span>
      <span className="diff-line-content" role="cell">
        <DiffLineContent line={line} showWhitespace={showWhitespace} wordDiff={wordDiff} />
      </span>
    </div>
  );
}

DiffLineRow.displayName = 'DiffLineRow';

/** Main canvas component for the diff viewer. Renders side-by-side, unified, or split view. */
export function ToolCanvas({
  original,
  modified,
  viewMode,
  showWhitespace,
  contextLines,
  wordDiff,
  wrapLines,
  diffLines,
  filteredDiffLines: externalFilteredDiffLines,
  canvasRef,
  onOriginalChange,
  onModifiedChange,
  onViewModeChange,
}: ToolCanvasProps) {
  const filteredDiffLines = useMemo(
    () =>
      viewMode === 'unified'
        ? (externalFilteredDiffLines ?? computeDiff(original, modified, contextLines, wordDiff))
        : diffLines,
    [original, modified, viewMode, contextLines, diffLines, wordDiff, externalFilteredDiffLines]
  );

  const origNumLines = original.split('\n').length || 1;
  const modNumLines = modified.split('\n').length || 1;

  // Memoized diff counts used by unified/split views — avoids filtering arrays on every render
  const diffCounts = useMemo(() => {
    let adds = 0;
    let dels = 0;
    for (const l of filteredDiffLines) {
      if (l.type === 'added') adds++;
      else if (l.type === 'removed') dels++;
    }
    return { addCount: adds, delCount: dels };
  }, [filteredDiffLines]);

  const renderSideBySide = () => (
    <div
      className="diff-side-by-side"
      id="diff-panel-side-by-side"
      role="tabpanel"
      aria-labelledby="diff-tab-side-by-side"
    >
      {/* Original Panel */}
      <div className="diff-panel diff-panel-original">
        <div className="diff-panel-header">
          <span className="diff-header-original-icon">−</span> Original ({origNumLines} lines)
        </div>
        <textarea
          className="diff-textarea"
          value={original}
          onChange={(e) => onOriginalChange?.(e.target.value)}
          placeholder="Paste original text here..."
          spellCheck={false}
          aria-label="Original text"
        />
      </div>

      {/* Modified Panel */}
      <div className="diff-panel diff-panel-modified">
        <div className="diff-panel-header">
          <span className="diff-header-modified-icon">+</span> Modified ({modNumLines} lines)
        </div>
        <textarea
          className="diff-textarea"
          value={modified}
          onChange={(e) => onModifiedChange?.(e.target.value)}
          placeholder="Paste modified text here..."
          spellCheck={false}
          aria-label="Modified text"
        />
      </div>
    </div>
  );

  const renderUnified = () => {
    const { addCount, delCount } = diffCounts;
    return (
      <div
        className="diff-unified"
        id="diff-panel-unified"
        role="tabpanel"
        aria-labelledby="diff-tab-unified"
      >
        <div className="diff-unified-header">
          <span>Unified Diff View</span>
          <span className="diff-header-diff-stats">
            {addCount} addition{addCount !== 1 ? 's' : ''}, {delCount} deletion
            {delCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="diff-lines-container" role="region" aria-label="Unified diff output">
          {filteredDiffLines.length === 0 ? (
            <div className="diff-empty-placeholder" role="status">
              {original && modified
                ? '\u2713 No differences \u2014 the texts are identical'
                : original
                  ? 'Paste modified text to see the diff'
                  : modified
                    ? 'Paste original text to see the diff'
                    : 'Paste text in both panels to compare'}
            </div>
          ) : (
            <div role="table" aria-label="Unified diff lines">
              {filteredDiffLines.map((line, idx) => (
                <DiffLineRow
                  key={idx}
                  line={line}
                  showWhitespace={showWhitespace}
                  wordDiff={wordDiff}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSplit = () => {
    const { addCount, delCount } = diffCounts;
    return (
      <div
        className="diff-split"
        id="diff-panel-split"
        role="tabpanel"
        aria-labelledby="diff-tab-split"
      >
        {/* Left: Editor */}
        <div className="diff-split-editor">
          <div className="diff-split-header">
            <span className="diff-header-original-icon">−</span> Original
          </div>
          <textarea
            className="diff-textarea"
            value={original}
            onChange={(e) => onOriginalChange?.(e.target.value)}
            placeholder="Paste original text..."
            spellCheck={false}
            aria-label="Original text"
          />
        </div>

        {/* Right: Diff Output */}
        <div className="diff-split-output">
          <div className="diff-split-header">
            <span>Diff Output</span>
            <span className="diff-header-diff-stats">
              {addCount}+, {delCount}-
            </span>
          </div>
          <div className="diff-lines-container" role="region" aria-label="Split diff output lines">
            {filteredDiffLines.length === 0 ? (
              <div className="diff-empty-placeholder" role="status">
                {original && modified
                  ? '\u2713 No differences \u2014 the texts are identical'
                  : original
                    ? 'Paste modified text to see the diff'
                    : modified
                      ? 'Paste original text to see the diff'
                      : 'Diff will appear here after pasting text in both panels'}
              </div>
            ) : (
              <div role="table" aria-label="Split diff output lines">
                {filteredDiffLines.map((line, idx) => (
                  <DiffLineRow
                    key={idx}
                    line={line}
                    showWhitespace={showWhitespace}
                    wordDiff={wordDiff}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={canvasRef}
      className={`diff-canvas${wrapLines ? ' diff-canvas-wrap' : ''}`}
      role="application"
      aria-label="Diff Viewer"
    >
      {/* View Mode Tabs */}
      <div
        className="diff-mode-tabs"
        role="tablist"
        aria-label="Diff view mode"
        onKeyDown={(e) => {
          const modes = ['side-by-side', 'unified', 'split'] as const;
          const currentIdx = modes.indexOf(viewMode);
          let nextIdx: number | null = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            nextIdx = (currentIdx + 1) % modes.length;
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            nextIdx = (currentIdx - 1 + modes.length) % modes.length;
          } else if (e.key === 'Home') {
            nextIdx = 0;
          } else if (e.key === 'End') {
            nextIdx = modes.length - 1;
          }
          if (nextIdx !== null) {
            e.preventDefault();
            const nextMode = modes[nextIdx];
            if (nextMode) onViewModeChange?.(nextMode);
          }
        }}
      >
        {(['side-by-side', 'unified', 'split'] as const).map((mode) => (
          <TabButton
            key={mode}
            active={viewMode === mode}
            label={
              mode === 'side-by-side' ? 'Side-by-Side' : mode === 'unified' ? 'Unified' : 'Split'
            }
            shortcut={mode === 'side-by-side' ? 'Ctrl+1' : mode === 'unified' ? 'Ctrl+2' : 'Ctrl+3'}
            onClick={() => onViewModeChange?.(mode)}
            tabId={`diff-tab-${mode}`}
            panelId={`diff-panel-${mode}`}
          />
        ))}
      </div>

      {/* Screen reader live region for diff view mode changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {viewMode === 'side-by-side'
          ? 'Side-by-side'
          : viewMode === 'unified'
            ? 'Unified'
            : 'Split'}{' '}
        view active
      </div>

      {/* Diff Content */}
      <div className="diff-content">
        {viewMode === 'side-by-side' && renderSideBySide()}
        {viewMode === 'unified' && renderUnified()}
        {viewMode === 'split' && renderSplit()}
      </div>
    </div>
  );
}

ToolCanvas.displayName = 'ToolCanvas';

function TabButton({
  active,
  label,
  shortcut,
  onClick,
  tabId,
  panelId,
}: {
  active: boolean;
  label: string;
  shortcut?: string;
  onClick: () => void;
  tabId: string;
  panelId: string;
}) {
  return (
    <button
      type="button"
      className="diff-tab-button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {label}
      {shortcut && (
        <kbd className="tab-shortcut-hint" aria-hidden="true">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

TabButton.displayName = 'TabButton';
