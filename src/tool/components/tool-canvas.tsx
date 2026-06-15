'use client';

import { memo, useMemo } from 'react';
import type { DiffLine, WordChange, DiffOp } from '../types';

/**
 * Compute the Longest Common Subsequence (LCS) between two arrays of strings
 * using dynamic programming with a compact flat-buffer representation.
 *
 * Returns a flat Uint32Array of size (m+1) × (n+1) for backtracking.
 * The cell at index i*(n+1)+j holds the LCS length for a[0..i-1] and b[0..j-1].
 *
 * Time: O(m×n) | Space: O(m×n) in a single Uint32Array (~4 bytes per cell).
 * This is ~8× more memory-efficient than a number[][] and avoids allocation
 * of m+1 separate arrays.
 *
 * The caller is responsible for guarding against OOM via LCS_MAX_CELLS
 * before calling this function (see computeRawDiff).
 *
 * Note: Uint32Array is used (not Uint16Array) because LCS lengths can
 * exceed 65535 for large inputs. For example, comparing two ~1000-token
 * lines at the word level can need LCS values well above 65535.
 */
function computeLCSTable(a: string[], b: string[]): Uint32Array {
  const m = a.length;
  const n = b.length;
  const stride = n + 1;
  const size = (m + 1) * stride;
  const dp = new Uint32Array(size);
  for (let i = 1; i <= m; i++) {
    const base = i * stride;
    const prevBase = base - stride;
    const aVal = a[i - 1]!;
    for (let j = 1; j <= n; j++) {
      if (aVal === b[j - 1]) {
        dp[base + j] = dp[prevBase + j - 1]! + 1;
      } else {
        const up = dp[prevBase + j]!;
        const left = dp[base + j - 1]!;
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
    } else if (j > 0 && (i === 0 || dp[i * stride + j - 1]! >= dp[(i - 1) * stride + j]!)) {
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
 * Matches runs of non-whitespace ASCII/Latin characters and runs of whitespace
 * as separate tokens, and treats each CJK (Chinese, Japanese, Korean) character
 * as its own individual token.
 * This preserves spacing changes between words as visible tokens and enables
 * character-level highlighting for non-whitespace-delimited scripts.
 *
 * @param text - The single-line text to tokenize
 * @returns Array of non-empty string tokens (empty array when text is empty)
 */
function tokenize(text: string): string[] {
  // Match Latin word runs, whitespace runs, or individual CJK/Korean/Japanese characters.
  // Korean Hangul: U+AC00-U+D7AF (complete syllables)
  // Korean Jamo: U+1100-U+11FF (consonant/vowel components)
  // CJK Unified: U+2E80-U+9FFF (Chinese characters + CJK extensions)
  // CJK Supplement: U+F900-U+FAFF, U+3400-U+4DBF (CJK extension A)
  // Japanese Kana: U+3040-U+30FF (Hiragana + Katakana)
  // Small Kana Extension: U+1B000-U+1B0FF
  return (
    text.match(
      /[\w\u00C0-\u024F\u1E00-\u1EFF']+|\s+|[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3400-\u4DBF\u3040-\u30FF\u1B000-\u1B0FF]/gu
    ) ?? []
  );
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
    const line = result[i]!;
    if (line.type === 'removed') {
      pendingRemoved.push({ idx: i, content: line.content });
    } else if (line.type === 'added') {
      if (pendingRemoved.length > 0) {
        // Pair the first pending removed line with this added line (FIFO order)
        const removedLine = pendingRemoved.shift()!;
        const newLine = line.content;
        result[removedLine.idx]!.wordChanges = computeWordDiff(
          removedLine.content,
          newLine,
          'removed'
        );
        line.wordChanges = computeWordDiff(removedLine.content, newLine, 'added');
      }
    } else {
      // For unchanged lines, reset the pending removed queue — subsequent added
      // lines after an unchanged block shouldn't be paired with earlier removals.
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
    if (result[idx]!.type !== 'unchanged') {
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
        const prevLine = result[lastIncluded]!;
        const nextLine = result[idx]!;
        const startOld = prevLine.oldLineNumber != null ? prevLine.oldLineNumber + 1 : null;
        const startNew = prevLine.newLineNumber != null ? prevLine.newLineNumber + 1 : null;
        const endOld = nextLine.oldLineNumber != null ? nextLine.oldLineNumber - 1 : null;
        const endNew = nextLine.newLineNumber != null ? nextLine.newLineNumber - 1 : null;

        let hunkLabel = '...';
        if (startOld != null && endOld != null && startNew != null && endNew != null) {
          if (startOld <= endOld && startNew <= endNew) {
            hunkLabel = `@@ -${startOld},${endOld - startOld + 1} +${startNew},${endNew - startNew + 1} @@`;
          }
          // When valid ranges span both old and new but one side is empty (e.g. start==end+1
          // after boundary contains only adds/removes), fall through to '...'
        } else if (startOld != null && endOld != null && startOld <= endOld) {
          // Collapsed region has only original-side lines (removals only)
          hunkLabel = `@@ -${startOld},${endOld - startOld + 1} +1,0 @@`;
        } else if (startNew != null && endNew != null && startNew <= endNew) {
          // Collapsed region has only modified-side lines (additions only)
          hunkLabel = `@@ -1,0 +${startNew},${endNew - startNew + 1} @@`;
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
    const compareChunkOrig = ignoreWhitespace ? chunkOrig.map((l) => l.trim()) : chunkOrig;
    const compareChunkMod = ignoreWhitespace ? chunkMod.map((l) => l.trim()) : chunkMod;

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
  // If there are no changed lines, or no lines at all, the filtered result is empty
  if (diffLines.length === 0) return [];
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
  // Fast path: if both inputs are empty, return an empty diff immediately.
  // This is checked before the identical-string fast path because
  // `''.split('\n')` returns `['']` (length 1), which would produce an
  // incorrect single-element unchanged line for empty inputs.
  if (original === '' && modified === '') return [];

  // Fast path: if the strings are identical (or whitespace-trimmed identical
  // when ignoreWhitespace is on), skip LCS entirely.
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

  // Fast path: when ignoring whitespace, if the trimmed texts are identical,
  // all lines are unchanged (only whitespace differs).
  if (ignoreWhitespace && original.trim() === modified.trim()) {
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
 * The output follows the GNU unified diff format with proper hunk headers
 * (``@@ -start,count +start,count @@``) separated by context lines.
 * Hunks are grouped around change regions for compact, readable output.
 *
 * When `diffLines` is provided (pre-computed full diff from {@link computeRawDiff}),
 * it avoids re-computing the LCS, which is a significant optimization for large inputs.
 * Without `diffLines`, a full LCS pass is performed via {@link computeRawDiff} directly
 * (bypassing the unnecessary context-line filtering layer of {@link computeDiff}).
 *
 * @param original - The original (old) text
 * @param modified - The modified (new) text
 * @param diffLines - Optional pre-computed full diff lines (from computeRawDiff)
 * @param contextLines - Number of context lines per hunk (default 3, pass -1 for all lines)
 * @param ignoreWhitespace - When true, whitespace-only changes are ignored
 */
export function generateUnifiedDiffString(
  original: string,
  modified: string,
  diffLines?: DiffLine[],
  contextLines: number = 3,
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

  // Use pre-computed diff lines when available to avoid re-computing LCS.
  // We need the full unfiltered diff so we can build hunks ourselves.
  const diffLines_ = diffLines ?? computeRawDiff(original, modified, false, ignoreWhitespace);

  const result: string[] = [];
  result.push(`--- original`);
  result.push(`+++ modified`);

  // Build hunks: group consecutive changed lines with their surrounding context.
  // A hunk starts at the first changed line minus contextLines and ends at the
  // last changed line plus contextLines, with at least one unchanged line between
  // hunks before merging them.
  const effectiveContext = contextLines < 0 ? Number.MAX_SAFE_INTEGER : contextLines;

  // Find indices of changed lines
  const changedIndices: number[] = [];
  for (let idx = 0; idx < diffLines_.length; idx++) {
    const line = diffLines_[idx] as DiffLine;
    if (line.type !== 'unchanged') {
      changedIndices.push(idx);
    }
  }

  if (changedIndices.length === 0) {
    // No changes — everything is unchanged. For a unified diff this means
    // there's nothing to show beyond the header (or we show everything).
    if (effectiveContext === Number.MAX_SAFE_INTEGER) {
      for (const line of diffLines_) {
        result.push(` ${line.content}`);
      }
    }
    return result.join('\n');
  }

  // Group changed indices into hunks: a new hunk starts when there's more than
  // 2*effectiveContext unchanged lines between changes.
  const hunks: { start: number; end: number }[] = [];
  let hunkStart = Math.max(0, changedIndices[0]! - effectiveContext);
  let hunkEnd = Math.min(diffLines_.length - 1, changedIndices[0]! + effectiveContext);

  for (let ci = 1; ci < changedIndices.length; ci++) {
    const idx = changedIndices[ci]!;
    // If the gap between the current hunk end and this change is <= 2*effectiveContext,
    // extend the hunk. Otherwise, close the current hunk and start a new one.
    if (idx - hunkEnd <= 2 * effectiveContext + 1) {
      hunkEnd = Math.min(diffLines_.length - 1, idx + effectiveContext);
    } else {
      hunks.push({ start: hunkStart, end: hunkEnd });
      hunkStart = Math.max(0, idx - effectiveContext);
      hunkEnd = Math.min(diffLines_.length - 1, idx + effectiveContext);
    }
  }
  hunks.push({ start: hunkStart, end: hunkEnd });

  // Emit each hunk
  for (const hunk of hunks) {
    const hunkLines = diffLines_.slice(hunk.start, hunk.end + 1);

    // Calculate line ranges for the hunk header
    const firstLine = hunkLines[0]!;

    const hunkOldStart = firstLine.oldLineNumber ?? 1;
    const hunkNewStart = firstLine.newLineNumber ?? 1;

    let hunkOldCount = 0;
    let hunkNewCount = 0;
    for (const hl of hunkLines) {
      if (hl.oldLineNumber != null) hunkOldCount++;
      if (hl.newLineNumber != null) hunkNewCount++;
    }

    result.push(`@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@`);

    for (const line of hunkLines) {
      if (line.type === 'added') {
        result.push(`+${line.content}`);
      } else if (line.type === 'removed') {
        result.push(`-${line.content}`);
      } else {
        result.push(` ${line.content}`);
      }
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
  /** Whether the diff shown may be stale (deferred values still computing). */
  isDiffStale?: boolean;
}

/**
 * Renders the content of a diff line, optionally with word-level highlighting.
 * When wordChanges are present, renders each segment with inline highlighting.
 */
const DiffLineContent = memo(function DiffLineContent({
  line,
  showWhitespace,
  wordDiff,
}: {
  line: DiffLine;
  showWhitespace: boolean;
  wordDiff: boolean;
}) {
  const isHunk = line.type === 'unchanged' && line.content.startsWith('@@');

  // For hunk headers, render as-is without whitespace visualization
  // (the @@ syntax is structural, not content, and dots would be confusing)
  if (isHunk) {
    return <span className="diff-hunk-header">{line.content}</span>;
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
});

DiffLineContent.displayName = 'DiffLineContent';

/** Renders a single line in the unified/split diff view with line numbers and type indicator. */
const DiffLineRow = memo(function DiffLineRow({
  line,
  showWhitespace,
  wordDiff,
  rowIndex,
}: {
  line: DiffLine;
  showWhitespace: boolean;
  wordDiff: boolean;
  /** 1-based row index for aria-rowindex. 0 = not in a table context. */
  rowIndex?: number;
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
      aria-rowindex={rowIndex}
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
      <span className="diff-line-content" role="cell" tabIndex={0}>
        <DiffLineContent line={line} showWhitespace={showWhitespace} wordDiff={wordDiff} />
      </span>
    </div>
  );
});

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
  isDiffStale: externalIsDiffStale,
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
        {!original && !modified && (
          <div className="diff-empty-placeholder" role="status">
            Paste text in both panels to compare
          </div>
        )}
      </div>
      {(original || modified) && (
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {original && modified
            ? 'Text comparison ready — toggle to Unified or Split view to see the diff'
            : modified
              ? 'Modified text entered; paste original text to compare'
              : 'Original text entered; paste modified text to compare'}
        </div>
      )}
    </div>
  );

  const renderUnified = () => {
    const { addCount, delCount } = diffCounts;
    const showStale = externalIsDiffStale && filteredDiffLines.length > 0;
    return (
      <div
        className="diff-unified"
        id="diff-panel-unified"
        role="tabpanel"
        aria-labelledby="diff-tab-unified"
      >
        <div className="diff-unified-header">
          <span>Unified Diff View</span>
          {showStale && (
            <span className="toolbar-large-warning" role="alert">
              Computing diff…
            </span>
          )}
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
                  rowIndex={idx + 1}
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
    const showStale = externalIsDiffStale && filteredDiffLines.length > 0;
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
            {showStale && (
              <span className="toolbar-large-warning" role="alert">
                Computing…
              </span>
            )}
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
                    rowIndex={idx + 1}
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
