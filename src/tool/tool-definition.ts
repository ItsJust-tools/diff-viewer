import type { Tool } from '@itsjust/core';
import toolConfig from './tool.config';
import type { DiffViewerState } from './types';

function isDiffViewerState(value: unknown): value is DiffViewerState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.original === 'string' &&
    typeof v.modified === 'string' &&
    (v.viewMode === undefined ||
      typeof v.viewMode === 'string') &&
    (v.showWhitespace === undefined ||
      typeof v.showWhitespace === 'boolean') &&
    (v.contextLines === undefined ||
      typeof v.contextLines === 'number')
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
        },
      };
    }
    return {
      success: false,
      error:
        'Invalid data format: expected { original: string, modified: string, viewMode?: string, showWhitespace?: boolean, contextLines?: number }',
    };
  },
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};
