import type { Tool } from '@itsjust/core';
import toolConfig from './tool.config';
import type { DiffViewerState } from './types';

/** Allowed view mode values for the diff viewer. */
const VALID_VIEW_MODES = ['side-by-side', 'unified', 'split'] as const;

function isViewMode(value: unknown): value is 'side-by-side' | 'unified' | 'split' {
  return VALID_VIEW_MODES.includes(value as (typeof VALID_VIEW_MODES)[number]);
}

function isDiffViewerState(value: unknown): value is DiffViewerState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.original === 'string' &&
    typeof v.modified === 'string' &&
    (v.viewMode === undefined || isViewMode(v.viewMode)) &&
    (v.showWhitespace === undefined || typeof v.showWhitespace === 'boolean') &&
    (v.contextLines === undefined || typeof v.contextLines === 'number') &&
    (v.wordDiff === undefined || typeof v.wordDiff === 'boolean') &&
    (v.wrapLines === undefined || typeof v.wrapLines === 'boolean')
  );
}

export const diffViewerTool: Tool<DiffViewerState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: {
    original: '',
    modified: '',
    viewMode: 'side-by-side',
    showWhitespace: true,
    contextLines: 3,
    wordDiff: true,
    wrapLines: false,
  },
  serialize: (state) => JSON.stringify(state, null, 2),
  deserialize: (data) => {
    if (isDiffViewerState(data)) {
      return {
        success: true,
        data: {
          original: data.original,
          modified: data.modified,
          viewMode: data.viewMode ?? 'side-by-side',
          showWhitespace: data.showWhitespace ?? true,
          contextLines: data.contextLines ?? 3,
          wordDiff: data.wordDiff ?? true,
          wrapLines: data.wrapLines ?? false,
        },
      };
    }
    return {
      success: false,
      error:
        'Invalid data format: expected { original: string, modified: string, viewMode?: string, showWhitespace?: boolean, contextLines?: number, wordDiff?: boolean, wrapLines?: boolean }',
    };
  },
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};
