/** Serializable state of the diff viewer, used for import/export and URL sharing. */
export interface DiffViewerState {
  /** The original (left/old) text to compare. */
  original: string;
  /** The modified (right/new) text to compare. */
  modified: string;
  /** The active view mode for displaying the diff. */
  viewMode: 'side-by-side' | 'unified' | 'split';
  /** Whether to visualize whitespace characters (spaces as ·, tabs as →). */
  showWhitespace: boolean;
  /** Number of context lines to show around changes in unified view. -1 disables filtering. */
  contextLines: number;
  /** Whether to enable word-level diff highlighting. */
  wordDiff: boolean;
  /** Whether to wrap long lines instead of truncating with ellipsis. */
  wrapLines: boolean;
}

/** A single line in the computed diff output. */
export interface DiffLine {
  /** Whether this line was added, removed, or left unchanged. */
  type: 'added' | 'removed' | 'unchanged';
  /** Line number in the original file, or null if the line is new. */
  oldLineNumber: number | null;
  /** Line number in the modified file, or null if the line was removed. */
  newLineNumber: number | null;
  /** The text content of the line (without trailing newline). */
  content: string;
  /**
   * Word-level changes within this line, when word diff is available.
   * Each segment represents a run of text that is added, removed, or unchanged
   * relative to the corresponding line on the opposite side.
   */
  wordChanges?: WordChange[];
}

/**
 * A single segment of a word-level diff within a changed line.
 * For added lines, 'removed' segments don't appear; for removed lines, 'added' segments don't appear.
 */
export interface WordChange {
  /** Whether this text segment was added, removed, or unchanged. */
  type: 'added' | 'removed' | 'unchanged';
  /** The text content of this segment. */
  text: string;
}

/**
 * Internal mapping from an LCS-backtracked operation index to the
 * original and modified line indices, used to pair added/removed lines
 * for word-level diff comparison.
 */
export interface DiffOp {
  type: 'added' | 'removed' | 'unchanged';
  oldIdx: number;
  newIdx: number;
}
