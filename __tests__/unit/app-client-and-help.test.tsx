import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import ToolClient from '@/app/tool-client';
import ToolClientWrapper from '@/app/tool-client-wrapper';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="dynamic-tool-client">dynamic-tool-client</div>,
}));

const mockSetData = vi.fn();
const mockToast = vi.fn();
const mockHandleExport = vi.fn();
const mockImport = vi.fn();
const mockToolbarActions = { canUndo: false, canRedo: false, onUndo: vi.fn(), onRedo: vi.fn() };

vi.mock('@itsjust/core', () => ({
  ToolShell: ({ toolbar, sidebar, canvas, statusBar }: Record<string, unknown>) => (
    <div>
      <div>{toolbar as ReactNode}</div>
      <div>{sidebar as ReactNode}</div>
      <div>{canvas as ReactNode}</div>
      <div>{statusBar as ReactNode}</div>
    </div>
  ),
  ImportExport: ({ onShare }: { onShare?: () => void }) => (
    <button type="button" onClick={onShare}>
      trigger-share
    </button>
  ),
  useTool: () => ({
    state: {
      data: { original: 'Hello', modified: '' },
      setData: mockSetData,
      isDirty: false,
      lastSaved: 'just now',
    },
    toast: mockToast,
    supportedFormats: ['json'],
    handleExport: mockHandleExport,
    importFromFile: mockImport,
    isImporting: false,
    toolbarActions: mockToolbarActions,
  }),
}));

vi.mock('@/tool', () => ({
  toolConfig: {
    id: 'diff-viewer',
    name: 'Diff Viewer',
    version: '1.0.0',
    features: { sidebar: true },
    theme: { brand: 'Diff Viewer' },
  },
  templateBaseVersion: '1.0.0',
  diffViewerTool: {
    serialize: (state: unknown) => JSON.stringify(state),
    deserialize: () => ({ success: true, data: { original: 'From Shared Url', modified: '' } }),
  },
  ToolCanvas: ({ original, modified }: { original: string; modified: string }) => (
    <div>
      canvas:{original}:{modified}
    </div>
  ),
  ToolToolbar: () => <div>toolbar</div>,
  ToolSidebar: ({ original, modified }: { original: string; modified: string }) => (
    <div>
      sidebar:{original}:{modified}
    </div>
  ),
  computeDiff: () => [],
  computeRawDiff: () => [],
  filterDiffLines: (lines) => lines,
  generateUnifiedDiffString: () => '',
}));

describe('app client and help page', () => {
  beforeEach(() => {
    mockSetData.mockReset();
    mockToast.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(navigator, 'share', {
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    window.history.replaceState(null, '', 'http://localhost:3000/?state=e30%3D');
  });

  it('renders dynamic tool client wrapper', () => {
    render(<ToolClientWrapper />);
    expect(screen.getByTestId('dynamic-tool-client')).toBeInTheDocument();
  });

  it('handles share flow in tool client', async () => {
    render(<ToolClient />);

    expect(screen.getByText('toolbar')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('trigger-share'));
    });

    expect(mockToast).toHaveBeenCalled();
  });
});
