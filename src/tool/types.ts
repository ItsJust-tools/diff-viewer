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
}
