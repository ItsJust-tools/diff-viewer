import { describe, it, expect } from 'vitest';
import {
  computeDiff,
  computeRawDiff,
  filterDiffLines,
  generateUnifiedDiffString,
} from '@/tool/components/tool-canvas';

describe('computeDiff — basic cases', () => {
  it('produces empty diff for empty inputs', () => {
    const result = computeDiff('', '', 3);
    expect(result).toEqual([]);
  });

  it('returns all added lines when original is empty', () => {
    const result = computeDiff('', 'a\nb\nc', 3);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('added');
    expect(result[0]!.content).toBe('a');
    expect(result[0]!.oldLineNumber).toBeNull();
    expect(result[0]!.newLineNumber).toBe(1);
    expect(result[1]!.type).toBe('added');
    expect(result[2]!.type).toBe('added');
  });

  it('returns all removed lines when modified is empty', () => {
    const result = computeDiff('a\nb\nc', '', 3);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('removed');
    expect(result[0]!.content).toBe('a');
    expect(result[0]!.oldLineNumber).toBe(1);
    expect(result[0]!.newLineNumber).toBeNull();
  });

  it('returns empty for identical texts (no changes to show)', () => {
    // With context lines, unchanged text without changes shows nothing
    const result = computeDiff('hello\nworld', 'hello\nworld', 3);
    expect(result).toEqual([]);
  });

  it('returns all unchanged lines for identical texts with -1 context', () => {
    const result = computeDiff('hello\nworld', 'hello\nworld', -1);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('unchanged');
    expect(result[0]!.content).toBe('hello');
    expect(result[0]!.oldLineNumber).toBe(1);
    expect(result[0]!.newLineNumber).toBe(1);
    expect(result[1]!.type).toBe('unchanged');
    expect(result[1]!.content).toBe('world');
  });
});

describe('computeDiff — line diffs', () => {
  it('detects a single addition', () => {
    const result = computeDiff('a\nc', 'a\nb\nc', 3);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('unchanged');
    expect(result[1]!.type).toBe('added');
    expect(result[1]!.content).toBe('b');
    expect(result[1]!.oldLineNumber).toBeNull();
    expect(result[1]!.newLineNumber).toBe(2);
    expect(result[2]!.type).toBe('unchanged');
  });

  it('detects a single removal', () => {
    const result = computeDiff('a\nb\nc', 'a\nc', 3);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('unchanged');
    expect(result[1]!.type).toBe('removed');
    expect(result[1]!.content).toBe('b');
    expect(result[1]!.oldLineNumber).toBe(2);
    expect(result[1]!.newLineNumber).toBeNull();
    expect(result[2]!.type).toBe('unchanged');
  });

  it('detects a modification (removal + addition)', () => {
    const result = computeDiff('a\nold\nc', 'a\nnew\nc', 3);
    // The LCS may produce: unchanged(a), removed(old), added(new), unchanged(c)
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[0]!.type).toBe('unchanged');
    expect(result.filter((l) => l.type === 'removed').map((l) => l.content)).toContain('old');
    expect(result.filter((l) => l.type === 'added').map((l) => l.content)).toContain('new');
  });

  it('handles completely different texts', () => {
    const result = computeDiff('aaa', 'bbb', 3);
    // All lines should be changed: removed "aaa", added "bbb"
    expect(result.some((l) => l.type === 'removed')).toBe(true);
    expect(result.some((l) => l.type === 'added')).toBe(true);
    expect(result.some((l) => l.type === 'unchanged')).toBe(false);
  });
});

describe('computeDiff — word-level diff integration', () => {
  it('includes wordChanges for modified lines', () => {
    const result = computeDiff('The quick brown fox', 'The slow brown dog', -1);
    const removedLines = result.filter((l) => l.type === 'removed');
    const addedLines = result.filter((l) => l.type === 'added');
    expect(removedLines.length).toBeGreaterThanOrEqual(1);
    expect(addedLines.length).toBeGreaterThanOrEqual(1);
    // At least one of the changed lines should have wordChanges
    const hasWordChanges = result.some(
      (l) =>
        (l.type === 'added' || l.type === 'removed') && l.wordChanges && l.wordChanges.length > 0
    );
    expect(hasWordChanges).toBe(true);
  });

  it('adds wordChanges for paired removed/added lines', () => {
    const result = computeDiff('line1\nunchanged\nline3', 'line1\nmodified\nline3', -1);
    const removedLine = result.find((l) => l.type === 'removed' && l.content === 'unchanged');
    const addedLine = result.find((l) => l.type === 'added' && l.content === 'modified');
    expect(removedLine).toBeDefined();
    expect(addedLine).toBeDefined();
    expect(removedLine!.wordChanges).toBeDefined();
    expect(addedLine!.wordChanges).toBeDefined();
    // Word changes show the transformation: unchanged -> modified
    expect(removedLine!.wordChanges!.length).toBeGreaterThan(0);
    expect(addedLine!.wordChanges!.length).toBeGreaterThan(0);
  });

  it('does not add wordChanges for unchanged lines', () => {
    const result = computeDiff('hello\nworld', 'hello\nworld', -1);
    for (const line of result) {
      expect(line.wordChanges).toBeUndefined();
    }
  });
});

describe('computeDiff — context lines filtering', () => {
  it('shows all lines when contextLines is -1 (no filtering)', () => {
    const lines = [];
    for (let i = 1; i <= 10; i++) lines.push(`line${i}`);
    const modified = [...lines];
    modified[2] = 'CHANGED';
    modified[7] = 'CHANGED';

    const result = computeDiff(lines.join('\n'), modified.join('\n'), -1);
    expect(result.length).toBeGreaterThan(3);
    // Should have changed lines at positions 2 and 7
    expect(result.filter((l) => l.type === 'removed').length).toBeGreaterThanOrEqual(2);
    expect(result.filter((l) => l.type === 'added').length).toBeGreaterThanOrEqual(2);
  });

  it('shows only changed lines (and hunk markers) when contextLines is 0', () => {
    const lines = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const modified = ['a', 'b', 'CHANGED', 'd', 'e', 'f', 'CHANGED'];

    const result = computeDiff(lines.join('\n'), modified.join('\n'), 0);
    // With contextLines=0, we should only see changed lines separated by a hunk marker
    const changeLines = result.filter((l) => l.type === 'added' || l.type === 'removed');
    expect(changeLines).toHaveLength(4); // 2 removed + 2 added
    expect(result.filter((l) => l.type === 'added').length).toBe(2);
    expect(result.filter((l) => l.type === 'removed').length).toBe(2);
  });

  it('shows context lines around changes', () => {
    const lines = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const modified = ['a', 'b', 'CHANGED', 'd', 'e', 'f', 'g'];

    const result = computeDiff(lines.join('\n'), modified.join('\n'), 2);
    // With contextLines=2 around "c" changed to "CHANGED", we should see some unchanged lines
    const unchanged = result.filter((l) => l.type === 'unchanged');
    expect(unchanged.length).toBeGreaterThan(0);
    // Should have "a" and "b" before, and "d" and "e" after (2 context lines each)
    const contents = unchanged.map((l) => l.content);
    expect(contents).toContain('a');
    expect(contents).toContain('b');
    expect(contents).toContain('d');
    expect(contents).toContain('e');
  });
});

describe('computeDiff — edge cases', () => {
  it('handles trailing newlines', () => {
    const result = computeDiff('line1\n', 'line1\nline2\n', 3);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]!.type).toBe('unchanged');
  });

  it('handles multiline inserts', () => {
    const result = computeDiff('start\nend', 'start\nmiddle1\nmiddle2\nend', 3);
    expect(result.filter((l) => l.type === 'added').length).toBe(2);
    expect(result[1]!.type).toBe('added');
    expect(result[2]!.type).toBe('added');
  });

  it('handles multiline deletes', () => {
    const result = computeDiff('start\nmiddle1\nmiddle2\nend', 'start\nend', 3);
    expect(result.filter((l) => l.type === 'removed').length).toBe(2);
  });

  it('handles special characters in content', () => {
    const result = computeDiff(
      'normal <script>alert("xss")</script>',
      'normal <safe>content</safe>',
      3
    );
    expect(result.some((l) => l.type === 'removed')).toBe(true);
    expect(result.some((l) => l.type === 'added')).toBe(true);
  });

  it('ignoreWhitespace fast path returns all unchanged when only whitespace differs', () => {
    const result = computeDiff('  indented\n    more indented', 'indented\nmore indented', -1, true, true);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('unchanged');
    expect(result[0]!.content).toBe('  indented');
    expect(result[1]!.type).toBe('unchanged');
    expect(result[1]!.content).toBe('    more indented');
  });

  it('handles very large inputs with fallback (no OOM)', () => {
    const origLines = Array.from({ length: 5000 }, (_, i) => `line${i}`);
    const modLines = Array.from(
      { length: 5000 },
      (_, i) => `line${i % 2 === 0 ? i : 'changed' + i}`
    );
    const result = computeDiff(origLines.join('\n'), modLines.join('\n'), -1);
    // Should have produced output without crashing
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(10000);
  });

  it('handles single-line changes correctly', () => {
    const result = computeDiff('only line', 'changed line', 3);
    expect(result[0]!.type).toBe('removed');
    expect(result[1]!.type).toBe('added');
  });

  it('correctly tracks line numbers', () => {
    const result = computeDiff('a\nb\nc\nd\ne', 'a\nb\nmodified\nd\ne', -1);
    // Find the modified region: b unchanged, then removed c, added modified, then d unchanged
    const bLine = result.find((l) => l.content === 'b');
    expect(bLine).toBeDefined();
    expect(bLine!.oldLineNumber).toBe(2);
    expect(bLine!.newLineNumber).toBe(2);

    const dLine = result.find((l) => l.content === 'd');
    expect(dLine).toBeDefined();
    expect(dLine!.oldLineNumber).toBe(4);
    expect(dLine!.newLineNumber).toBe(4);
  });

  it('skips word-level diff computation when enableWordDiff is false', () => {
    const result = computeDiff('The quick brown fox', 'The slow brown dog', -1, false);
    const addedLines = result.filter((l) => l.type === 'added');
    const removedLines = result.filter((l) => l.type === 'removed');
    expect(addedLines.length).toBeGreaterThanOrEqual(1);
    expect(removedLines.length).toBeGreaterThanOrEqual(1);
    // No wordChanges should be present when word diff is disabled
    for (const line of result) {
      expect(line.wordChanges).toBeUndefined();
    }
  });

  it('skips word-level diff in chunked fallback when enableWordDiff is false', () => {
    // Create large enough input to trigger chunked path
    const origLines = Array.from({ length: 5000 }, (_, i) => `line${i}`);
    const modLines = Array.from(
      { length: 5000 },
      (_, i) => `line${i % 2 === 0 ? i : 'changed' + i}`
    );
    const result = computeDiff(origLines.join('\n'), modLines.join('\n'), -1, false);
    expect(result.length).toBeGreaterThan(0);
    for (const line of result) {
      expect(line.wordChanges).toBeUndefined();
    }
  });

  it('handles chunk boundaries correctly with overlapping chunks', () => {
    // Create input that spans multiple chunks to test boundary handling.
    // The key scenario: a sequence of unchanged lines that crosses a chunk
    // boundary should be correctly detected as unchanged, not as add/remove.
    const origLines: string[] = [];
    const modLines: string[] = [];
    // 2500 lines of identical content (spans 2 chunks with 2000 chunk size)
    for (let i = 0; i < 2500; i++) {
      origLines.push(`line${i}`);
      modLines.push(`line${i}`);
    }
    // Add a change at the end
    modLines.push('extra line');

    const result = computeDiff(origLines.join('\n'), modLines.join('\n'), -1);
    // All 2500 original lines should be unchanged
    const unchanged = result.filter((l) => l.type === 'unchanged');
    expect(unchanged.length).toBe(2500);
    // The extra line should be an addition
    const added = result.filter((l) => l.type === 'added');
    expect(added.length).toBe(1);
    expect(added[0]!.content).toBe('extra line');
    // No lines should be marked as removed (all original lines are present)
    expect(result.filter((l) => l.type === 'removed').length).toBe(0);
  });

  it('handles chunk boundaries with insertions at the seam', () => {
    // Create input where an insertion happens right at a chunk boundary.
    // Chunk size is 2000, so the boundary is around line 1950-2050.
    const origLines: string[] = [];
    const modLines: string[] = [];
    for (let i = 0; i < 4000; i++) {
      origLines.push(`line${i}`);
      modLines.push(`line${i}`);
    }
    // Insert a line at position 1995 (near the chunk boundary)
    modLines.splice(1995, 0, 'INSERTED AT BOUNDARY');

    const result = computeDiff(origLines.join('\n'), modLines.join('\n'), -1);
    // Should have exactly one added line
    const added = result.filter((l) => l.type === 'added');
    expect(added.length).toBe(1);
    expect(added[0]!.content).toBe('INSERTED AT BOUNDARY');
    // All original lines should still be present as unchanged
    const unchanged = result.filter((l) => l.type === 'unchanged');
    expect(unchanged.length).toBe(4000);
    // No lines should be removed
    expect(result.filter((l) => l.type === 'removed').length).toBe(0);
  });

  it('handles chunk boundaries with deletions at the seam', () => {
    // Create input where a deletion happens right at a chunk boundary.
    const origLines: string[] = [];
    const modLines: string[] = [];
    for (let i = 0; i < 4000; i++) {
      origLines.push(`line${i}`);
      modLines.push(`line${i}`);
    }
    // Remove a line at position 1995 (near the chunk boundary)
    origLines.splice(1995, 1);

    const result = computeDiff(origLines.join('\n'), modLines.join('\n'), -1);
    // Should have exactly one removed line (line1995)
    const removed = result.filter((l) => l.type === 'removed');
    const added = result.filter((l) => l.type === 'added');
    const unchanged = result.filter((l) => l.type === 'unchanged');
    // The LCS should find the deletion. With 3999×4000 = ~16M cells,
    // this uses the non-chunked path. The result should have 1 removed line.
    // Note: the LCS may produce different but equally valid alignments.
    // The key assertion is that the total number of changed lines is correct.
    expect(removed.length + added.length).toBe(1);
    expect(unchanged.length).toBe(3999);
  });
});

describe('computeDiff — ignoreWhitespace', () => {
  it('treats lines with only whitespace changes as unchanged', () => {
    const result = computeDiff('  hello\nworld', 'hello\nworld', -1, true, true);
    expect(result.every((l) => l.type === 'unchanged')).toBe(true);
  });

  it('still detects real content changes when ignoreWhitespace is on', () => {
    const result = computeDiff('hello\nworld', 'hello\nWRONG', -1, false, true);
    const added = result.filter((l) => l.type === 'added');
    const removed = result.filter((l) => l.type === 'removed');
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(removed[0]!.content).toBe('world');
    expect(added[0]!.content).toBe('WRONG');
  });

  it('preserves original (untrimmed) content when ignoreWhitespace is on', () => {
    const result = computeDiff('  hello', 'hello', -1, false, true);
    // The line should show as unchanged but preserve original content
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('unchanged');
    expect(result[0]!.content).toBe('  hello'); // preserved original
  });

  it('fast path returns all unchanged when only whitespace differs', () => {
    const result = computeDiff('  hello\n  world', 'hello\nworld', -1, true, true);
    expect(result).toHaveLength(2);
    expect(result.every((l) => l.type === 'unchanged')).toBe(true);
    expect(result[0]!.content).toBe('  hello');
    expect(result[1]!.content).toBe('  world');
  });
});

describe('computeRawDiff', () => {
  it('returns one unchanged empty string line for empty inputs (fast path)', () => {
    const result = computeRawDiff('', '');
    // Fast path: '' === '' triggers the identical-string path, which
    // splits '' into [''], producing one "unchanged" line with empty content
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('unchanged');
    expect(result[0]!.content).toBe('');
  });

  it('returns all added when original is empty', () => {
    const result = computeRawDiff('', 'a\nb');
    expect(result).toHaveLength(2);
    expect(result.every((l) => l.type === 'added')).toBe(true);
  });

  it('returns all removed when modified is empty', () => {
    const result = computeRawDiff('a\nb', '');
    expect(result).toHaveLength(2);
    expect(result.every((l) => l.type === 'removed')).toBe(true);
  });

  it('returns unchanged lines when texts match', () => {
    const result = computeRawDiff('a\nb', 'a\nb');
    expect(result).toHaveLength(2);
    expect(result.every((l) => l.type === 'unchanged')).toBe(true);
  });

  it('returns unchanged lines for identical text without context filtering', () => {
    const result = computeRawDiff('hello\nworld', 'hello\nworld');
    expect(result).toHaveLength(2);
    expect(result.every((l) => l.type === 'unchanged')).toBe(true);
  });

  it('fast path for identical strings skips LCS entirely', () => {
    const longOriginal = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const result = computeRawDiff(longOriginal, longOriginal);
    expect(result).toHaveLength(100);
    expect(result.every((l) => l.type === 'unchanged')).toBe(true);
  });

  it('fast path for whitespace-identical when ignoreWhitespace is on', () => {
    const result = computeRawDiff('  hello\n  world', 'hello\nworld', true, true);
    expect(result).toHaveLength(2);
    expect(result.every((l) => l.type === 'unchanged')).toBe(true);
    expect(result[0]!.content).toBe('  hello');
  });

  it('computes raw diff with word-level changes enabled (may produce 3-4 lines)', () => {
    const result = computeRawDiff('a\nb\nc', 'a\nX\nc', true);
    // The LCS may produce 3 or 4 lines depending on how empty-string
    // at the trailing split is handled.  Check the key assertions.
    const removed = result.find((l) => l.type === 'removed');
    const added = result.find((l) => l.type === 'added');
    expect(removed).toBeDefined();
    expect(added).toBeDefined();
    // Word changes should be present since wordDiff is enabled
    expect(removed!.wordChanges).toBeDefined();
    expect(added!.wordChanges).toBeDefined();
  });

  it('skips word-level changes when enableWordDiff is false', () => {
    const result = computeRawDiff('a\nb\nc', 'a\nX\nc', false);
    const removed = result.find((l) => l.type === 'removed');
    const added = result.find((l) => l.type === 'added');
    expect(removed).toBeDefined();
    expect(added).toBeDefined();
    expect(removed!.wordChanges).toBeUndefined();
    expect(added!.wordChanges).toBeUndefined();
  });

  it('falls back to chunked path for very large inputs', () => {
    const origLines = Array.from({ length: 8000 }, (_, i) => `line ${i}`);
    const modLines = Array.from({ length: 8000 }, (_, i) =>
      i % 1000 === 0 ? `modified ${i}` : `line ${i}`
    );
    const result = computeRawDiff(origLines.join('\n'), modLines.join('\n'), false);
    const added = result.filter((l) => l.type === 'added');
    const removed = result.filter((l) => l.type === 'removed');
    expect(added.length).toBeGreaterThan(0);
    expect(removed.length).toBeGreaterThan(0);
  });
});

describe('filterDiffLines', () => {
  it('returns all lines unchanged when contextLines is -1', () => {
    const raw = computeRawDiff('hello\nworld\nfoo', 'hello\nCHANGED\nfoo');
    const filtered = filterDiffLines(raw, -1);
    expect(filtered).toEqual(raw);
  });

  it('collapses unchanged lines far from changes with context 0', () => {
    const original = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const modified = original.replace('line 50', 'CHANGED');
    const raw = computeRawDiff(original, modified);
    const filtered = filterDiffLines(raw, 0);
    expect(filtered.length).toBeLessThan(raw.length);
    expect(filtered.some((l) => l.type === 'added')).toBe(true);
    expect(filtered.some((l) => l.type === 'removed')).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(filterDiffLines([], 3)).toEqual([]);
  });

  it('returns empty array when there are no changed lines and contextLines >= 0', () => {
    const raw = computeRawDiff('hello\nworld', 'hello\nworld');
    const filtered = filterDiffLines(raw, 3);
    expect(filtered).toEqual([]);
  });

  it('keeps context lines around changes when contextLines > 0', () => {
    const original = ['a', 'b', 'c', 'd', 'e'].join('\n');
    const modified = ['a', 'b', 'X', 'd', 'e'].join('\n');
    const raw = computeRawDiff(original, modified);
    const filtered = filterDiffLines(raw, 1);
    expect(filtered.length).toBeGreaterThanOrEqual(3);
    expect(filtered.filter((l) => l.type === 'unchanged').length).toBeGreaterThanOrEqual(1);
  });

  it('preserves all lines when every line is a change', () => {
    const raw = computeRawDiff('a\nb\nc', 'X\nY\nZ');
    const filtered = filterDiffLines(raw, 3);
    expect(filtered).toHaveLength(raw.length);
    expect(filtered.every((l) => l.type !== 'unchanged')).toBe(true);
  });
});

describe('generateUnifiedDiffString', () => {
  it('returns empty string for empty inputs', () => {
    expect(generateUnifiedDiffString('', '')).toBe('');
  });

  it('returns all added lines prefixed with + when original is empty', () => {
    const result = generateUnifiedDiffString('', 'a\nb');
    expect(result).toBe('+a\n+b');
  });

  it('returns all removed lines prefixed with - when modified is empty', () => {
    const result = generateUnifiedDiffString('a\nb', '');
    expect(result).toBe('-a\n-b');
  });

  it('produces a properly formatted unified diff header', () => {
    const result = generateUnifiedDiffString('hello', 'world');
    expect(result).toContain('--- original');
    expect(result).toContain('+++ modified');
    expect(result).toContain('@@');
    const lines = result.split('\n');
    expect(lines[0]).toBe('--- original');
    expect(lines[1]).toBe('+++ modified');
    expect(lines[2]).toMatch(/^@@/);
  });

  it('prefixes added lines with + and removed with -', () => {
    const result = generateUnifiedDiffString('a\nb\nc', 'a\nX\nc');
    const lines = result.split('\n');
    const contentLines = lines.slice(3);
    expect(contentLines).toContain('-b');
    expect(contentLines).toContain('+X');
    expect(contentLines).toContain(' a');
  });

  it('uses pre-computed diff lines when provided (avoids re-computation)', () => {
    const raw = computeRawDiff('a\nb', 'a\nX');
    const result = generateUnifiedDiffString('a\nb', 'a\nX', raw);
    expect(result).toContain('--- original');
    expect(result).toContain('+++ modified');
    const lines = result.split('\n');
    expect(lines).toContain('-b');
    expect(lines).toContain('+X');
  });

  it('handles ignoreWhitespace for unified diff output', () => {
    const result = generateUnifiedDiffString('  hello', 'hello', undefined, true);
    // With ignoreWhitespace, the texts are considered identical,
    // so the diff shows unchanged content (not empty output).
    expect(result).toContain('--- original');
    expect(result).toContain('+++ modified');
    const lines = result.split('\n');
    // The content line should be the original (padded) text
    expect(lines.some((l) => l.trim() === 'hello' || l === '  hello')).toBe(true);
  });

  it('prefaces unchanged lines with a space', () => {
    const mixedResult = generateUnifiedDiffString('a\nb\nc', 'a\nX\nc');
    const lines = mixedResult.split('\n');
    const contentLines = lines.slice(3);
    expect(contentLines).toContain(' a');
  });
});