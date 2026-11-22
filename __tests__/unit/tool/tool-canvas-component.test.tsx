import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  ToolCanvas,
  VIRTUALIZATION_MIN_LINES,
  type ToolCanvasProps,
} from '@/tool/components/tool-canvas';
import type { DiffLine } from '@/tool/types';

function makeLine(overrides: Partial<DiffLine> & Pick<DiffLine, 'type' | 'content'>): DiffLine {
  return {
    oldLineNumber: 1,
    newLineNumber: 1,
    ...overrides,
  };
}

function makeLines(count: number): DiffLine[] {
  const lines: DiffLine[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(
      i % 3 === 0
        ? makeLine({
            type: 'added',
            content: `added-${i}`,
            oldLineNumber: null,
            newLineNumber: i + 1,
          })
        : makeLine({
            type: 'unchanged',
            content: `same-${i}`,
            oldLineNumber: i + 1,
            newLineNumber: i + 1,
          })
    );
  }
  return lines;
}

function baseCanvasProps(overrides: Partial<ToolCanvasProps> = {}): ToolCanvasProps {
  return {
    original: 'a\nb',
    modified: 'a\nc',
    viewMode: 'side-by-side',
    showWhitespace: false,
    contextLines: 3,
    wordDiff: false,
    wrapLines: false,
    diffLines: [],
    ...overrides,
  };
}

function mockMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('ToolCanvas component', () => {
  beforeEach(() => {
    mockMatchMedia();
  });

  it('renders side-by-side mode with textareas, placeholders and live region', () => {
    const { container } = render(<ToolCanvas {...baseCanvasProps()} />);
    expect(screen.getByLabelText('Original text')).toHaveValue('a\nb');
    expect(screen.getByLabelText('Modified text')).toHaveValue('a\nc');
    expect(screen.getByText('Original (2 lines)')).toBeInTheDocument();
    expect(screen.getByText('Modified (2 lines)')).toBeInTheDocument();
    expect(
      screen.getByText('Text comparison ready — toggle to Unified or Split view to see the diff')
    ).toBeInTheDocument();
    // active tab has kbd shortcut
    expect(
      within(screen.getByRole('tab', { name: /Side-by-Side/ })).getByText('Ctrl+1')
    ).toBeInTheDocument();
    expect(container.querySelector('.diff-canvas')?.className).not.toContain('diff-canvas-wrap');
  });

  it('shows empty placeholder in side-by-side mode and fires change handlers', () => {
    const onOriginalChange = vi.fn();
    const onModifiedChange = vi.fn();
    render(
      <ToolCanvas
        {...baseCanvasProps({ original: '', modified: 'y', onOriginalChange, onModifiedChange })}
      />
    );
    expect(
      screen.getByText('Modified text entered; paste original text to compare')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Original text'), { target: { value: 'x' } });
    expect(onOriginalChange).toHaveBeenCalledWith('x');
    fireEvent.change(screen.getByLabelText('Modified text'), { target: { value: 'z' } });
    expect(onModifiedChange).toHaveBeenCalledWith('z');
  });

  it('shows status placeholder when both side-by-side panels are empty', () => {
    render(<ToolCanvas {...baseCanvasProps({ original: '', modified: '' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Paste text in both panels to compare');
  });

  it('renders unified mode with computed diff, stats and rows', () => {
    render(<ToolCanvas {...baseCanvasProps({ viewMode: 'unified' })} />);
    expect(screen.getByText('Unified Diff View')).toBeInTheDocument();
    expect(screen.getByText('1 addition, 1 deletion')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.className.includes('diff-line-added'))).toBe(true);
    expect(rows.some((r) => r.className.includes('diff-line-removed'))).toBe(true);
  });

  it('renders unified mode empty states', () => {
    render(
      <ToolCanvas
        {...baseCanvasProps({ viewMode: 'unified', original: '', modified: '', isDiffStale: true })}
      />
    );
    expect(screen.getByText('Paste text in both panels to compare')).toBeInTheDocument();

    render(
      <ToolCanvas
        {...baseCanvasProps({
          viewMode: 'unified',
          original: 'a\nb',
          modified: 'a\nb',
          isDiffStale: true,
          filteredDiffLines: [],
        })}
      />
    );
    expect(screen.getByText('✓ No differences — the texts are identical')).toBeInTheDocument();
  });

  it('renders unified mode with word-level diff and whitespace visualization', () => {
    const lines = [
      makeLine({
        type: 'added',
        content: 'hello world',
        oldLineNumber: null,
        newLineNumber: 1,
        wordChanges: [
          { type: 'unchanged', text: 'hello ' },
          { type: 'added', text: 'world' },
        ],
      }),
    ];
    const { container } = render(
      <ToolCanvas
        {...baseCanvasProps({
          viewMode: 'unified',
          original: '',
          modified: 'hello world',
          wordDiff: true,
          showWhitespace: true,
          filteredDiffLines: lines,
        })}
      />
    );
    expect(container.querySelector('.diff-word-added')).toHaveTextContent('world');
    // whitespace shown as middle dot
    expect(container.querySelector('.diff-word-added')?.textContent).toBe('world');
    expect(container.textContent).toContain('\u00B7');
  });

  it('renders ellipsis hunk marker and hunk header rows', () => {
    const lines = [
      makeLine({ type: 'unchanged', content: '@@ -1,2 +1,2 @@' }),
      makeLine({ type: 'unchanged', content: '...' }),
      makeLine({ type: 'added', content: 'new line', oldLineNumber: null, newLineNumber: 2 }),
      makeLine({ type: 'removed', content: 'old line', oldLineNumber: 1, newLineNumber: null }),
    ];
    const { container } = render(
      <ToolCanvas
        {...baseCanvasProps({
          viewMode: 'unified',
          original: 'x',
          modified: 'y',
          filteredDiffLines: lines,
        })}
      />
    );
    expect(container.querySelector('.diff-hunk-header')).toHaveTextContent('@@ -1,2 +1,2 @@');
    expect(container.querySelector('.diff-hunk-ellipsis')).toHaveTextContent('...');
    expect(
      screen.getByRole('row', { name: 'Removed line (old line 1): old line' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: 'Added line (new line 2): new line' })
    ).toBeInTheDocument();
  });

  it('renders split mode with editor, diff output and placeholder variants', () => {
    const lines = [
      makeLine({ type: 'added', content: 'c', oldLineNumber: null, newLineNumber: 2 }),
      makeLine({ type: 'removed', content: 'b', oldLineNumber: 2, newLineNumber: null }),
    ];
    const first = render(
      <ToolCanvas
        {...baseCanvasProps({
          viewMode: 'split',
          original: 'a\nb',
          modified: 'a\nc',
          diffLines: lines,
        })}
      />
    );
    expect(screen.getByText('Diff Output')).toBeInTheDocument();
    expect(screen.getByText('1+, 1-')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Split diff output lines' })).toBeInTheDocument();
    first.unmount();

    // identical texts placeholder
    render(
      <ToolCanvas
        {...baseCanvasProps({
          viewMode: 'split',
          original: 'a',
          modified: 'a',
          diffLines: [],
        })}
      />
    );
    expect(
      screen.getAllByText('✓ No differences — the texts are identical').length
    ).toBeGreaterThan(0);
  });

  it('uses virtualization for very large unified diffs', () => {
    const lines = makeLines(VIRTUALIZATION_MIN_LINES + 100);
    render(
      <ToolCanvas
        {...baseCanvasProps({
          viewMode: 'unified',
          original: 'big',
          modified: 'bigger',
          filteredDiffLines: lines,
        })}
      />
    );
    const virtual = screen.getByTestId('diff-virtualized-list');
    expect(virtual).toBeInTheDocument();
    const table = within(virtual).getByRole('table');
    expect(table.getAttribute('aria-rowcount')).toBe(String(lines.length));
    // only a window of rows is rendered
    expect(virtual.querySelectorAll('[role="row"]').length).toBeLessThan(lines.length / 2);
  });

  it('scrolls the virtualized list via onScroll', () => {
    const lines = makeLines(VIRTUALIZATION_MIN_LINES + 100);
    render(
      <ToolCanvas
        {...baseCanvasProps({
          viewMode: 'unified',
          original: 'big',
          modified: 'bigger',
          filteredDiffLines: lines,
        })}
      />
    );
    const virtual = screen.getByTestId('diff-virtualized-list');
    const before = virtual.querySelector('[role="row"]')?.textContent ?? '';
    fireEvent.scroll(virtual, { target: { scrollTop: 21 * 500 } });
    const after = virtual.querySelector('[role="row"]')?.textContent ?? '';
    expect(before).not.toBe(after);
  });

  it('switches view modes with tabs and arrow keys', () => {
    const onViewModeChange = vi.fn();
    // viewMode is a controlled prop: arrow keys always compute from 'unified'
    render(<ToolCanvas {...baseCanvasProps({ viewMode: 'unified', onViewModeChange })} />);
    fireEvent.click(screen.getByRole('tab', { name: /Split/ }));
    expect(onViewModeChange).toHaveBeenCalledWith('split');

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onViewModeChange).toHaveBeenCalledWith('split');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(onViewModeChange).toHaveBeenCalledWith('side-by-side');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
    expect(onViewModeChange).toHaveBeenCalledWith('split');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
    expect(onViewModeChange).toHaveBeenCalledWith('side-by-side');
    // Enter does not switch modes
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Enter' });
    expect(onViewModeChange).toHaveBeenCalledTimes(5);
  });

  it('applies wrap class when wrapLines is enabled', () => {
    const { container } = render(<ToolCanvas {...baseCanvasProps({ wrapLines: true })} />);
    expect(container.querySelector('.diff-canvas')?.className).toContain('diff-canvas-wrap');
  });
});
