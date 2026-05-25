export interface DiffViewerState {
  original: string;
  modified: string;
  viewMode: 'side-by-side' | 'unified' | 'split';
  showWhitespace: boolean;
  contextLines: number;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}
