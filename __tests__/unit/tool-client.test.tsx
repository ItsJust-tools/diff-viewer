import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import ToolClient from '@/app/tool-client';
import { compressToEncodedURIComponent } from 'lz-string';
import type { DiffLine } from '@/tool/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Keep React real, but pin useDeferredValue to a stale (different) value so
// the "Computing diff…" stale-warning branch is reachable for large inputs.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useDeferredValue: <T,>(value: T): T =>
      (typeof value === 'string' && value.length > 0 ? value.slice(0, -1) : value) as T,
  };
});

const state: {
  original: string;
  modified: string;
  viewMode: 'side-by-side' | 'unified' | 'split';
  showWhitespace: boolean;
  contextLines: number;
  wordDiff: boolean;
  wrapLines: boolean;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
} = {
  original: 'a\nb',
  modified: 'a\nc',
  viewMode: 'side-by-side',
  showWhitespace: false,
  contextLines: 3,
  wordDiff: false,
  wrapLines: false,
  ignoreWhitespace: false,
  ignoreCase: false,
};

const mockSetData = vi.fn();
const mockToast = vi.fn();
const mockHandleExport = vi.fn();
const mockImportFromFile = vi.fn();
const mockCopyToClipboard = vi.fn().mockResolvedValue(true);
const mockComputeRawDiff = vi.fn((_o?: string, _m?: string) => [] as DiffLine[]);
const mockGenerateUnifiedDiff = vi.fn((_o?: string, _m?: string) => '');
const toolStateMock: {
  data: typeof state;
  setData: typeof mockSetData;
  isDirty: boolean;
  lastSaved: string | null;
} = {
  data: state,
  setData: mockSetData,
  isDirty: false,
  lastSaved: 'just now',
};
const dragStateMock = { isDragging: false };

vi.mock('@itsjust/core', async () => {
  const actual = await vi.importActual<typeof import('@itsjust/core')>('@itsjust/core');
  return {
    ...actual,
    copyTextToClipboard: (...args: unknown[]) => mockCopyToClipboard(...(args as [string])),
    useDragAndDropImport: () => dragStateMock,
    ImportExport: ({ onShare }: { onShare?: () => void }) => (
      <button type="button" onClick={onShare}>
        trigger-share
      </button>
    ),
    useTool: () => ({
      state: toolStateMock,
      toast: mockToast,
      supportedFormats: ['json', 'png', 'jpeg', 'webp', 'pdf'],
      handleExport: mockHandleExport,
      importFromFile: mockImportFromFile,
      isImporting: false,
      toolbarActions: { canUndo: false, canRedo: false, onUndo: vi.fn(), onRedo: vi.fn() },
    }),
  };
});

vi.mock('@/tool', async () => {
  const actual = await vi.importActual<typeof import('@/tool')>('@/tool');
  return {
    ...actual,
    computeRawDiff: (...args: unknown[]) => mockComputeRawDiff(...(args as [string, string])),
    filterDiffLines: (lines: unknown[]) => lines,
    generateUnifiedDiffString: (...args: unknown[]) =>
      mockGenerateUnifiedDiff(args[0] as string, args[1] as string),
  };
});

function keyOnWindow(eventInit: { key: string } & Record<string, unknown>) {
  fireEvent.keyDown(window, eventInit);
}

function lastDataUpdater() {
  return mockSetData.mock.calls.at(-1)![0] as (prev: typeof state) => typeof state;
}

describe('ToolClient', () => {
  beforeEach(() => {
    state.original = 'a\nb';
    state.modified = 'a\nc';
    state.viewMode = 'side-by-side';
    state.showWhitespace = false;
    state.contextLines = 3;
    state.wordDiff = false;
    state.wrapLines = false;
    state.ignoreWhitespace = false;
    state.ignoreCase = false;
    toolStateMock.isDirty = false;
    toolStateMock.lastSaved = 'just now';
    dragStateMock.isDragging = false;
    mockSetData.mockReset();
    mockToast.mockReset();
    mockHandleExport.mockReset();
    mockImportFromFile.mockReset();
    mockCopyToClipboard.mockReset().mockResolvedValue(true);
    mockComputeRawDiff.mockReset().mockReturnValue([]);
    mockGenerateUnifiedDiff.mockReset().mockReturnValue('');
    window.history.replaceState(null, '', 'http://localhost:3000/');
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders toolbar, sidebar, canvas and status bar content', () => {
    mockComputeRawDiff.mockReturnValue([
      { type: 'added', content: 'c', oldLineNumber: null, newLineNumber: 2 },
      { type: 'removed', content: 'b', oldLineNumber: 2, newLineNumber: null },
    ]);
    const { container } = render(<ToolClient />);
    expect(document.title).toBe('Diff Viewer');
    expect(screen.getByText('+1 / -1')).toBeInTheDocument();
    expect(screen.getByText('Tool v1.8.0')).toBeInTheDocument();
    expect(screen.getByText('Saved just now')).toBeInTheDocument();
    expect(container.querySelectorAll('textarea').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('trigger-share')).toBeInTheDocument();
  });

  it('shows unsaved status and drop overlay when dirty and dragging', () => {
    toolStateMock.isDirty = true;
    toolStateMock.lastSaved = null;
    dragStateMock.isDragging = true;
    render(<ToolClient />);
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    expect(screen.getByText('Drop file to import')).toBeInTheDocument();
  });

  it('truncates oversized input and toasts an error', () => {
    render(<ToolClient />);
    const big = 'x'.repeat(500_001);
    fireEvent.change(screen.getByLabelText('Original text'), { target: { value: big } });
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('Truncated'), 'error');
    const next = lastDataUpdater()(state);
    expect(next.original).toHaveLength(500_000);
    expect(next.modified).toBe(state.modified);
  });

  it('handles export, swap, clear and view-mode keyboard shortcuts', () => {
    render(<ToolClient />);
    keyOnWindow({ key: 'e', ctrlKey: true, shiftKey: true });
    expect(mockHandleExport).toHaveBeenCalledWith('json');
    keyOnWindow({ key: 'p', ctrlKey: true, shiftKey: true });
    expect(mockHandleExport).toHaveBeenCalledWith('png');
    keyOnWindow({ key: 'j', ctrlKey: true, shiftKey: true });
    expect(mockHandleExport).toHaveBeenCalledWith('jpeg');
    keyOnWindow({ key: 'w', ctrlKey: true, shiftKey: true });
    expect(mockHandleExport).toHaveBeenCalledWith('webp');
    keyOnWindow({ key: 'd', ctrlKey: true, shiftKey: true });
    expect(mockHandleExport).toHaveBeenCalledWith('pdf');

    keyOnWindow({ key: 's', ctrlKey: true, shiftKey: true });
    const swapped = lastDataUpdater()(state);
    expect(swapped.original).toBe('a\nc');
    expect(swapped.modified).toBe('a\nb');
    expect(mockToast).toHaveBeenCalledWith('Swapped original and modified', 'success');

    keyOnWindow({ key: 'Backspace', ctrlKey: true, shiftKey: true });
    const cleared = lastDataUpdater()(state);
    expect(cleared.original).toBe('');
    expect(cleared.modified).toBe('');
    expect(mockToast).toHaveBeenCalledWith('Cleared both panels', 'success');

    keyOnWindow({ key: '2', ctrlKey: true });
    expect(lastDataUpdater()(state).viewMode).toBe('unified');
    keyOnWindow({ key: '3', ctrlKey: true });
    expect(lastDataUpdater()(state).viewMode).toBe('split');
    state.viewMode = 'unified';
    keyOnWindow({ key: '1', ctrlKey: true });
    expect(lastDataUpdater()(state).viewMode).toBe('side-by-side');

    keyOnWindow({ key: '.', ctrlKey: true });
    keyOnWindow({ key: ',', ctrlKey: true });
    keyOnWindow({ key: 'i', ctrlKey: true });
    keyOnWindow({ key: 'l', ctrlKey: true });
    const toggles = mockToast.mock.calls.filter(
      (c) => String(c[0]).endsWith('enabled') || String(c[0]).endsWith('disabled')
    );
    expect(toggles.length).toBeGreaterThanOrEqual(4);
    // plain keydown without modifier is ignored
    keyOnWindow({ key: 'e' });
    expect(mockHandleExport).toHaveBeenCalledTimes(5);
  });

  it('handles copy diff / json / original / modified shortcuts including failure paths', async () => {
    const generateUnifiedDiffSpy = mockGenerateUnifiedDiff;
    render(<ToolClient />);
    // empty diff -> error toast
    generateUnifiedDiffSpy.mockReturnValue('');
    keyOnWindow({ key: 'c', ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(mockToast).toHaveBeenCalledWith(
      'Nothing to copy — paste text in both panels first',
      'error'
    );

    generateUnifiedDiffSpy.mockReturnValue('-b\n+c');
    keyOnWindow({ key: 'c', ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(mockCopyToClipboard).toHaveBeenCalledWith('-b\n+c');
    expect(mockToast).toHaveBeenCalledWith('Unified diff copied to clipboard', 'success');

    keyOnWindow({ key: 'y', ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(mockToast).toHaveBeenCalledWith('State copied as JSON to clipboard', 'success');

    keyOnWindow({ key: 'o', ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(mockToast).toHaveBeenCalledWith('Original text copied to clipboard', 'success');

    keyOnWindow({ key: 'm', ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(mockToast).toHaveBeenCalledWith('Modified text copied to clipboard', 'success');

    // clipboard failure
    mockCopyToClipboard.mockRejectedValueOnce(new Error('denied'));
    keyOnWindow({ key: 'o', ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(mockToast).toHaveBeenCalledWith('Failed to copy to clipboard', 'error');
  });

  it('copies original/modified with error toast when empty', async () => {
    state.original = '';
    state.modified = '';
    render(<ToolClient />);
    keyOnWindow({ key: 'o', ctrlKey: true, shiftKey: true });
    keyOnWindow({ key: 'm', ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(mockToast).toHaveBeenCalledWith('Nothing to copy — original text is empty', 'error');
    expect(mockToast).toHaveBeenCalledWith('Nothing to copy — modified text is empty', 'error');
  });

  it('loads state from shared URL on mount', () => {
    const serialized = JSON.stringify({ original: 'shared-orig', modified: 'shared-mod' });
    const encoded = compressToEncodedURIComponent(serialized);
    expect(encoded).toBeTruthy();
    window.history.replaceState(null, '', `http://localhost:3000/?state=${encoded}`);

    render(<ToolClient />);
    expect(mockSetData).toHaveBeenCalledWith({
      original: 'shared-orig',
      modified: 'shared-mod',
      viewMode: 'side-by-side',
      showWhitespace: true,
      contextLines: 3,
      wordDiff: true,
      wrapLines: false,
      ignoreWhitespace: false,
      ignoreCase: false,
    });
    expect(mockToast).toHaveBeenCalledWith('Loaded state from shared URL', 'success');
  });

  it('shows error toast for invalid shared URL state', () => {
    window.history.replaceState(null, '', 'http://localhost:3000/?state=not-a-valid-state');
    render(<ToolClient />);
    expect(mockToast).toHaveBeenCalledWith('Invalid shared URL', 'error');
    expect(mockSetData).not.toHaveBeenCalled();
  });

  it('shows error toast when deserialization fails from shared URL', () => {
    const encoded = compressToEncodedURIComponent(JSON.stringify({ bogus: true }));
    window.history.replaceState(null, '', `http://localhost:3000/?state=${encoded}`);
    render(<ToolClient />);
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/invalid/i), 'error');
    expect(mockSetData).not.toHaveBeenCalled();
  });

  it('shares via Web Share API when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: shareMock,
    });
    render(<ToolClient />);
    await act(async () => {
      fireEvent.click(screen.getByText('trigger-share'));
    });
    expect(shareMock).toHaveBeenCalled();
    const call = shareMock.mock.calls[0] as [Record<string, string>];
    const [payload] = call;
    expect(payload.url).toContain('state=');
    expect(payload.url).toContain('tool=diff-viewer');
    expect(mockToast).toHaveBeenCalledWith('Shared URL ready', 'success');
  });

  it('swallows AbortError from Web Share API without success toast', async () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    const shareMock = vi.fn().mockRejectedValue(abort);
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: shareMock,
    });
    render(<ToolClient />);
    await act(async () => {
      fireEvent.click(screen.getByText('trigger-share'));
    });
    expect(shareMock).toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalledWith('Shared URL ready', 'success');
    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('falls back to clipboard for share URL when Web Share API missing', async () => {
    render(<ToolClient />);
    await act(async () => {
      fireEvent.click(screen.getByText('trigger-share'));
    });
    expect(mockCopyToClipboard).toHaveBeenCalledWith(expect.stringContaining('state='));
    expect(mockToast).toHaveBeenCalledWith('Share URL copied to clipboard', 'success');
  });

  it('reports share URL copy failure', async () => {
    mockCopyToClipboard.mockResolvedValueOnce(false);
    render(<ToolClient />);
    await act(async () => {
      fireEvent.click(screen.getByText('trigger-share'));
    });
    expect(mockToast).toHaveBeenCalledWith('Failed to copy share URL to clipboard', 'error');
  });

  it('shows stale warning for large inputs and unified diff stats', () => {
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    state.original = 'x'.repeat(60_000);
    state.modified = 'y'.repeat(60_000);
    state.viewMode = 'unified';
    mockComputeRawDiff.mockReturnValue([
      { type: 'added', content: 'y', oldLineNumber: null, newLineNumber: 1 },
    ]);
    render(<ToolClient />);
    // the sidebar large-input note, the toolbar and the canvas "Computing diff…" stale warnings
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Computing diff…').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 addition, 0 deletions')).toBeInTheDocument();
  });
});
