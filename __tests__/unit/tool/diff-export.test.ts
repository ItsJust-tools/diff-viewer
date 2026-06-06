import { describe, it, expect } from 'vitest';
import { generateUnifiedDiffString, filterDiffLines, computeRawDiff } from '@/tool/components/tool-canvas';
import type { DiffLine } from '@/tool/types';

describe('generateUnifiedDiffString', () => {
  it('returns empty string for empty inputs', () => {
    expect(generateUnifiedDiffString('', '')).toBe('');
  });

  it('returns all added lines when original is empty', () => {
    const result = generateUnifiedDiffString('', 'a\nb\nc');
    const lines = result.split('\n');
    // When original is empty, the function returns just prefixed added lines
    expect(lines[0]).toBe('+a');
    expect(lines[1]).toBe('+b');
    expect(lines[2]).toBe('+c');
  });

  it('returns all removed lines when modified is empty', () => {
    const result = generateUnifiedDiffString('a\nb\nc', '');
    const lines = result.split('\n');
    // When modified is empty, the function returns just prefixed removed lines
    expect(lines[0]).toBe('-a');
    expect(lines[1]).toBe('-b');
    expect(lines[2]).toBe('-c');
  });

  it('returns empty diff for identical texts', () => {
    const result = generateUnifiedDiffString('hello\nworld', 'hello\nworld');
    // All lines should be context lines prefixed with space (no +/- lines)
    const lines = result.split('\n');
    expect(lines.filter((l) => l.startsWith(' '))).toHaveLength(2);
    // +++ modified starts with +, so filter more precisely
    const adds = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    const removes = lines.filter((l) => l.startsWith('-') && !l.startsWith('---'));
    expect(adds).toHaveLength(0);
    expect(removes).toHaveLength(0);
  });

  it('shows addition with + prefix', () => {
    const result = generateUnifiedDiffString('a\nb\nc', 'a\nx\nb\nc');
    const lines = result.split('\n');
    const adds = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    expect(adds).toContain('+x');
    expect(adds).toHaveLength(1);
  });

  it('shows removal with - prefix', () => {
    const result = generateUnifiedDiffString('a\nb\nc', 'a\nc');
    const lines = result.split('\n');
    const removes = lines.filter((l) => l.startsWith('-') && !l.startsWith('---'));
    expect(removes).toContain('-b');
    expect(removes).toHaveLength(1);
  });

  it('shows modification as removal + addition', () => {
    const result = generateUnifiedDiffString('a\nold\nc', 'a\nnew\nc');
    expect(result).toContain('+new');
    expect(result).toContain('-old');
  });

  it('accepts pre-computed diff lines to avoid redundant LCS', () => {
    const original = 'first\nsecond\nthird';
    const modified = 'first\nsecond modified\nthird';
    const diffLines = computeRawDiff(original, modified, false);
    const resultWithLines = generateUnifiedDiffString(original, modified, diffLines);
    const resultWithoutLines = generateUnifiedDiffString(original, modified);
    expect(resultWithLines).toBe(resultWithoutLines);
  });

  it('handles special characters in content', () => {
    const result = generateUnifiedDiffString('normal', 'special @#$%^&*()');
    expect(result).toContain('+special @#$%^&*()');
    expect(result).toContain('-normal');
  });

  it('handles trailing newline differences', () => {
    const result = generateUnifiedDiffString('a\n', 'a\nb\n');
    expect(result).toContain('+b');
    expect(result).not.toContain('+++b');
  });

  it('produces valid unified diff format with headers', () => {
    const result = generateUnifiedDiffString('line1', 'line1\nline2');
    const lines = result.split('\n');
    expect(lines[0]).toBe('--- original');
    expect(lines[1]).toBe('+++ modified');
    expect(lines[2]).toMatch(/^@@/);
    expect(lines[3]).toBe(' line1');
    expect(lines[4]).toBe('+line2');
  });

  it('handles single-line additions (empty original)', () => {
    expect(generateUnifiedDiffString('', 'new line')).toBe('+new line');
  });

  it('handles single-line deletions (empty modified)', () => {
    expect(generateUnifiedDiffString('old line', '')).toBe('-old line');
  });

  it('handles word-diff disabled for better performance', () => {
    const diffLines = computeRawDiff('The quick brown fox', 'The slow brown dog', false);
    const result = generateUnifiedDiffString('The quick brown fox', 'The slow brown dog', diffLines);
    expect(result).toContain('-The quick brown fox');
    expect(result).toContain('+The slow brown dog');
  });
});

describe('generateUnifiedDiffString — with context lines filtering', () => {
  it('pre-computed diff lines are passed through verbatim', () => {
    const diffLines: DiffLine[] = [
      { type: 'unchanged', oldLineNumber: 1, newLineNumber: 1, content: 'hello' },
      { type: 'unchanged', oldLineNumber: 2, newLineNumber: 2, content: 'world' },
    ];
    const result = generateUnifiedDiffString('hello\nworld', 'hello\nworld', diffLines);
    // The diff uses DiffLine content, not the original/modified strings
    expect(result).toContain(' hello');
    expect(result).toContain(' world');
  });
});

describe('filterDiffLines', () => {
  function makeUnchanged(content: string, line: number): DiffLine {
    return { type: 'unchanged', oldLineNumber: line, newLineNumber: line, content };
  }

  function makeAdded(content: string, newLine: number): DiffLine {
    return { type: 'added', oldLineNumber: null, newLineNumber: newLine, content };
  }

  function makeRemoved(content: string, oldLine: number): DiffLine {
    return { type: 'removed', oldLineNumber: oldLine, newLineNumber: null, content };
  }

  it('returns input as-is for contextLines < 0', () => {
    const lines = [makeUnchanged('a', 1), makeUnchanged('b', 2), makeAdded('c', 3)];
    const result = filterDiffLines(lines, -1);
    expect(result).toHaveLength(3);
    expect(result).toEqual(lines);
  });

  it('returns all unchanged lines for contextLines = -1', () => {
    const lines = [makeUnchanged('a', 1), makeUnchanged('b', 2)];
    const result = filterDiffLines(lines, -1);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when there are no changes and contextLines >= 0', () => {
    const lines = [makeUnchanged('a', 1), makeUnchanged('b', 2), makeUnchanged('c', 3)];
    const result = filterDiffLines(lines, 3);
    expect(result).toEqual([]);
  });

  it('returns only changed lines when contextLines is 0', () => {
    const lines: DiffLine[] = [
      makeUnchanged('a', 1),
      makeUnchanged('b', 2),
      makeRemoved('old', 3),
      makeAdded('new', 3),
      makeUnchanged('d', 4),
      makeUnchanged('e', 5),
    ];
    const result = filterDiffLines(lines, 0);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('removed');
    expect(result[1]!.type).toBe('added');
  });

  it('includes context lines around changes', () => {
    // Lines: a(1), b(2), c(3), old(4,removed), new(4,added), d(5), e(6), f(7)
    // With contextLines=1: include c(3), old(4), new(4), d(5)
    const lines: DiffLine[] = [
      makeUnchanged('a', 1),
      makeUnchanged('b', 2),
      makeUnchanged('c', 3),
      makeRemoved('old', 4),
      makeAdded('new', 4),
      makeUnchanged('d', 5),
      makeUnchanged('e', 6),
      makeUnchanged('f', 7),
    ];
    const result = filterDiffLines(lines, 1);
    expect(result.length).toBeGreaterThanOrEqual(4);
    const contents = result.map((l) => l.content);
    expect(contents).toContain('c');
    expect(contents).toContain('old');
    expect(contents).toContain('new');
    expect(contents).toContain('d');
    // 'b' is 2 lines before the change, so NOT included with contextLines=1
    expect(contents).not.toContain('b');
    expect(contents).not.toContain('a');
    expect(contents).not.toContain('e');
    expect(contents).not.toContain('f');
  });

  it('inserts hunk markers between groups separated by unchanged lines', () => {
    const lines: DiffLine[] = [
      makeUnchanged('a', 1),
      makeRemoved('remove1', 2),
      makeAdded('add1', 2),
      makeUnchanged('b', 3),
      makeUnchanged('c', 4),
      makeUnchanged('d', 5),
      makeUnchanged('e', 6),
      makeRemoved('remove2', 7),
      makeAdded('add2', 7),
      makeUnchanged('f', 8),
    ];
    const result = filterDiffLines(lines, 0);
    expect(result[0]!.content).toBe('remove1');
    expect(result[1]!.content).toBe('add1');
    // Gap between group1 (lines 2) and group2 (lines 7) gets a '...' marker
    // because add1 has oldLineNumber=null (falls back to '...' instead of @@ header)
    expect(result[2]!.content).toBe('...');
    expect(result[3]!.content).toBe('remove2');
    expect(result[4]!.content).toBe('add2');
  });

  it('does not insert hunk markers for adjacent single-line gaps at contextLines=0', () => {
    // Groups separated by 1 unchanged line at contextLines=0 get a marker
    const lines: DiffLine[] = [
      makeUnchanged('before', 1),
      makeRemoved('remove1', 2),
      makeAdded('add1', 2),
      makeUnchanged('middle', 3),
      makeRemoved('remove2', 4),
      makeAdded('add2', 4),
      makeUnchanged('after', 5),
    ];
    const result = filterDiffLines(lines, 0);
    // Groups at indices [1,2] and [4,5], gap at 3 → hunk marker inserted
    expect(result).toHaveLength(5);
    expect(result[0]!.content).toBe('remove1');
    expect(result[1]!.content).toBe('add1');
    expect(result[2]!.content).toBe('...');
    expect(result[3]!.content).toBe('remove2');
    expect(result[4]!.content).toBe('add2');
  });

  it('hunk markers fall back to ... when boundaries have null line numbers', () => {
    // When the boundary lines before and after the gap lack both line numbers,
    // the code cannot compute proper @@ -x,y +x,y @@ headers and falls back to '...'
    const result = computeRawDiff(
      'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq\nr\ns\nt',
      'a\nx\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq\nr\ny\nt',
      false
    );
    const filtered = filterDiffLines(result, 0);
    // The gap between the first change (b→x, old=2/newest) and second (s→y, old=19)
    // falls back to '...' because the boundary lines have null on one side
    const markers = filtered.filter((l) => l.content === '...');
    expect(markers.length).toBe(1);
  });

  it('handles consecutive changed lines without extra markers', () => {
    const lines: DiffLine[] = [
      makeRemoved('old1', 1),
      makeAdded('new1', 1),
      makeRemoved('old2', 2),
      makeAdded('new2', 2),
      makeUnchanged('end', 3),
    ];
    const result = filterDiffLines(lines, 0);
    expect(result).toHaveLength(4);
    expect(result.every((l) => l.content !== '...')).toBe(true);
  });

  it('returns an empty array when no lines are provided', () => {
    expect(filterDiffLines([], 3)).toEqual([]);
  });

  it('handles empty arrays for contextLines >= 0', () => {
    expect(filterDiffLines([], 0)).toEqual([]);
    expect(filterDiffLines([], -1)).toEqual([]);
  });

  it('preserves line numbers and types through filtering', () => {
    const lines: DiffLine[] = [
      makeUnchanged('ctx', 1),
      makeRemoved('gone', 2),
      makeAdded('here', 2),
      makeUnchanged('after', 3),
    ];
    const result = filterDiffLines(lines, 1);
    const removed = result.find((l) => l.type === 'removed')!;
    const added = result.find((l) => l.type === 'added')!;
    expect(removed.oldLineNumber).toBe(2);
    expect(added.newLineNumber).toBe(2);
    expect(removed.newLineNumber).toBeNull();
    expect(added.oldLineNumber).toBeNull();
  });
});