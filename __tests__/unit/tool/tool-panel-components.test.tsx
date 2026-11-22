import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolToolbar } from '@/tool/components/tool-toolbar';
import { ToolSidebar } from '@/tool/components/tool-sidebar';
import type { DiffLine } from '@/tool/types';

const diffLines: DiffLine[] = [
  { type: 'added', content: 'a', oldLineNumber: null, newLineNumber: 1 },
  { type: 'removed', content: 'b', oldLineNumber: 1, newLineNumber: null },
  { type: 'removed', content: 'c', oldLineNumber: 2, newLineNumber: null },
  { type: 'unchanged', content: 'd', oldLineNumber: 3, newLineNumber: 3 },
];

describe('ToolToolbar', () => {
  it('shows paste hint when both inputs are empty', () => {
    render(<ToolToolbar original="" modified="" viewMode="side-by-side" />);
    expect(screen.getByText('Paste text in both panels to compare')).toBeInTheDocument();
  });

  it('shows line/char stats, additions, active flags and view mode label', () => {
    render(
      <ToolToolbar
        original={'line1\nline2'}
        modified="line1"
        viewMode="unified"
        additions={2}
        deletions={1}
        wordDiff
        showWhitespace
        wrapLines
        ignoreWhitespace
        ignoreCase
      />
    );
    expect(screen.getByText('2L /', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('1L /', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(screen.getByText('WS, WD, WR, IW, IC')).toBeInTheDocument();
    expect(screen.getByText('Unified')).toBeInTheDocument();
  });

  it('labels split view mode and large input warning', () => {
    render(<ToolToolbar original={'x'.repeat(100_001)} modified="y" viewMode="split" />);
    expect(screen.getByText('Split')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Large input — diff may be slower');
  });
});

describe('ToolSidebar', () => {
  function renderSidebar(overrides: Record<string, unknown> = {}) {
    const props = {
      original: 'a\nb',
      modified: 'a\nc',
      viewMode: 'unified' as const,
      showWhitespace: true,
      wordDiff: false,
      wrapLines: false,
      contextLines: 3,
      ignoreWhitespace: false,
      ignoreCase: false,
      diffLines,
      onShowWhitespaceChange: vi.fn(),
      onWordDiffChange: vi.fn(),
      onWrapLinesChange: vi.fn(),
      onContextLinesChange: vi.fn(),
      onIgnoreWhitespaceChange: vi.fn(),
      onIgnoreCaseChange: vi.fn(),
      onSwap: vi.fn(),
      onClear: vi.fn(),
      onCopyDiff: vi.fn(),
      onCopyJson: vi.fn(),
      onCopyOriginal: vi.fn(),
      onCopyModified: vi.fn(),
      ...overrides,
    };
    const view = render(<ToolSidebar {...props} />);
    return { ...view, props };
  }

  it('computes stats from diffLines and renders all toggles', () => {
    const { props, container } = renderSidebar();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    // Net changes = additions + deletions = 3
    const netRow = [...container.querySelectorAll('.stat-row')].find((el) =>
      el.textContent?.includes('Net Changes')
    )!;
    expect(netRow.querySelector('dd')?.textContent).toBe('3');

    expect(props.onShowWhitespaceChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Show whitespace characters (spaces as ·, tabs as →)'));
    expect(props.onShowWhitespaceChange).toHaveBeenCalledWith(false);

    fireEvent.click(
      screen.getByLabelText('Enable word-level diff highlighting within changed lines')
    );
    expect(props.onWordDiffChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('Wrap long lines instead of horizontal scrolling'));
    expect(props.onWrapLinesChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('Ignore whitespace-only changes when computing diff'));
    expect(props.onIgnoreWhitespaceChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('Ignore case-only changes when computing diff'));
    expect(props.onIgnoreCaseChange).toHaveBeenCalledWith(true);
  });

  it('clamps context lines input between 0 and 20 in unified mode only', () => {
    const first = renderSidebar();
    const input = first.getByLabelText('Context lines: 3');
    fireEvent.change(input, { target: { value: '99' } });
    expect(first.props.onContextLinesChange).toHaveBeenCalledWith(20);
    fireEvent.change(input, { target: { value: '-5' } });
    expect(first.props.onContextLinesChange).toHaveBeenCalledWith(0);
    first.unmount();

    const side = renderSidebar({ viewMode: 'side-by-side' });
    expect(side.queryByLabelText(/Context lines/)).not.toBeInTheDocument();
    side.unmount();
  });

  it('shows large input notes at different thresholds', () => {
    const mid = renderSidebar({ original: 'x'.repeat(100_001), diffStats: undefined });
    expect(screen.getByText('Large input — diff may be slower')).toBeInTheDocument();
    mid.unmount();

    const huge = renderSidebar({ original: 'x'.repeat(500_001) });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Large input detected — performance may degrade'
    );
    huge.unmount();
  });

  it('uses precomputed diff stats when provided', () => {
    renderSidebar({ diffStats: { additions: 7, deletions: 11, changes: 18 } });
    expect(screen.getByText('+7')).toBeInTheDocument();
    expect(screen.getByText('-11')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('disables actions when empty and enables copy buttons when text present', () => {
    const empty = renderSidebar({
      original: '',
      modified: '',
      diffLines: [],
      viewMode: 'side-by-side',
    });
    expect(empty.queryByLabelText('Context lines: 3')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Swap original and modified text (disabled)' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Clear both text panels (disabled)' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Copy unified diff to clipboard (disabled)' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Copy state as JSON to clipboard (disabled)' })
    ).toBeDisabled();
    expect(empty.queryByText('Copy Original Text')).not.toBeInTheDocument();
    expect(empty.queryByText('Copy Modified Text')).not.toBeInTheDocument();
    empty.unmount();

    renderSidebar();
    expect(screen.getByRole('button', { name: 'Swap original and modified text' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Copy original text to clipboard' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy modified text to clipboard' })
    ).toBeInTheDocument();
  });

  it('fires action callbacks', () => {
    const { props } = renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Swap original and modified text' }));
    expect(props.onSwap).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear both text panels' }));
    expect(props.onClear).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy unified diff to clipboard' }));
    expect(props.onCopyDiff).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy state as JSON to clipboard' }));
    expect(props.onCopyJson).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy original text to clipboard' }));
    expect(props.onCopyOriginal).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy modified text to clipboard' }));
    expect(props.onCopyModified).toHaveBeenCalled();
  });
});
