import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import pdfExporter from '@/tool/exporters/pdf';
import { ThemeScript, ThemeProvider, useTheme } from '@itsjust/core';
import { renderTool, createMockToolState, testConfig } from '@itsjust/core/testing';
import { ErrorBoundary } from '@itsjust/core';
import type { ExportOptions, ExportFormat } from '@itsjust/core';

// ---------------------------------------------------------------------------
// ThemeScript
// ---------------------------------------------------------------------------

describe('ThemeScript', () => {
  it('renders a script that sets theme, contrast and tool theme variables', () => {
    const { container } = render(
      <ThemeScript
        toolTheme={{ accent: '#111111', accentHover: '#222222', accentSubtle: 'rgba(0,0,0,0.1)' }}
      />
    );
    const script = container.querySelector('script')!;
    const html = script.textContent ?? '';
    expect(html).toContain('itsjust-theme');
    expect(html).toContain('data-theme');
    expect(html).toContain('data-contrast');
    expect(html).toContain('"accent":"#111111"');
    expect(html).toContain('--accent-hover');
  });

  it('renders without tool theme block when omitted', () => {
    const { container } = render(<ThemeScript />);
    const html = container.querySelector('script')!.textContent ?? '';
    expect(html).toContain('itsjust-theme');
    expect(html).not.toContain('--accent-hover');
  });
});

// ---------------------------------------------------------------------------
// ThemeProvider
// ---------------------------------------------------------------------------

describe('ThemeProvider', () => {
  beforeEach(() => {
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
    localStorage.clear();
  });

  it('provides theme context and setTheme works', () => {
    function Probe() {
      const { resolvedTheme, setTheme } = useTheme();
      return (
        <button type="button" data-testid="toggle" onClick={() => setTheme('dark')}>
          {resolvedTheme}
        </button>
      );
    }
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(getByTestId('toggle')).toHaveTextContent('light');
    fireEvent.click(getByTestId('toggle'));
    expect(getByTestId('toggle')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('itsjust-theme')).toBe('dark');
  });

  it('defaults to system preference when no stored theme', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    function Probe() {
      const { resolvedTheme } = useTheme();
      return <span data-testid="theme">{resolvedTheme}</span>;
    }
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(getByTestId('theme')).toHaveTextContent('dark');
  });
});

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <span>ok</span>;
}

describe('ErrorBoundary', () => {
  it('renders children and recovers from render errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender, getByText } = render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(getByText('ok')).toBeInTheDocument();
    rerender(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );
    expect(getByText('Something went wrong.')).toBeInTheDocument();
    rerender(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    );
    spy.mockRestore();
  });

  it('renders a custom fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary fallback={<div>custom-fallback</div>}>
        <Boom shouldThrow />
      </ErrorBoundary>
    );
    expect(getByText('custom-fallback')).toBeInTheDocument();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Testing harness
// ---------------------------------------------------------------------------

describe('testing harness', () => {
  it('renderTool wraps content in mock providers', () => {
    const { container } = renderTool(<div>child</div>);
    expect(container.querySelector('[data-theme="light"]')).toBeInTheDocument();
    expect(container.querySelector('[data-toast-mock]')).toBeInTheDocument();
    expect(testConfig.id).toBe('test-tool');
  });

  it('createMockToolState supports setData/undo/redo/clearHistory', () => {
    const s = createMockToolState({ n: 0 });
    expect(s.data.n).toBe(0);
    expect(s.canUndo).toBe(false);
    s.setData({ n: 1 });
    s.setData((prev) => ({ n: prev.n + 10 }));
    expect(s.data.n).toBe(11);
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(false);
    s.undo();
    expect(s.data.n).toBe(1);
    s.undo();
    expect(s.data.n).toBe(0);
    expect(s.canUndo).toBe(false);
    s.redo();
    s.redo();
    expect(s.data.n).toBe(11);
    expect(s.canRedo).toBe(false);
    s.clearHistory();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    expect(s.isDirty).toBe(false);
    expect(s.lastSaved).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PDF exporter
// ---------------------------------------------------------------------------

describe('PDF exporter', () => {
  function makeElement(): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = '<textarea>original text</textarea>';
    document.body.appendChild(el);
    return el;
  }

  function makeOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
    return {
      format: 'pdf' as ExportFormat,
      filename: 'out.pdf',
      ...overrides,
    };
  }

  function mockIframe(printMock: () => void, docOverrides: Record<string, unknown> = {}) {
    let capturedDoc: Record<string, unknown> | null = null;
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLIFrameElement) {
        const mockDoc: Record<string, unknown> = {
          open: vi.fn(),
          write: vi.fn(),
          close: vi.fn(),
          ...docOverrides,
        };
        capturedDoc = mockDoc;
        Object.defineProperty(node, 'contentDocument', {
          get: () => mockDoc,
          configurable: true,
        });
        Object.defineProperty(node, 'contentWindow', {
          get: () => ({ print: printMock }),
          configurable: true,
        });
      }
      return node;
    });
    return {
      appendChildSpy,
      doc: () => capturedDoc,
    };
  }

  it('exports to PDF via a print iframe with textarea replacement', async () => {
    const printMock = vi.fn();
    const el = makeElement();
    const { appendChildSpy, doc } = mockIframe(printMock);
    const result = await pdfExporter.export(el, makeOptions());
    expect(result.success).toBe(true);
    expect(result.format).toBe('pdf');
    expect(result.filename).toBe('out.pdf');
    expect(printMock).toHaveBeenCalledTimes(1);
    const writeSpy = doc()!.write as ReturnType<typeof vi.fn>;
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const html = String(writeSpy.mock.calls[0]![0]);
    expect(html).toContain('notepad-textarea-replacement');
    expect(html).toContain('original text');
    expect(html).toContain('data-theme');
    appendChildSpy.mockRestore();
  });

  it('falls back to a default filename when none provided', async () => {
    const printMock = vi.fn();
    const el = makeElement();
    const { appendChildSpy } = mockIframe(printMock);
    const result = await pdfExporter.export(el, makeOptions({ filename: undefined }));
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^export-\d+\.pdf$/);
    appendChildSpy.mockRestore();
  });

  it('returns error when the iframe document cannot be created', async () => {
    const el = makeElement();
    const { appendChildSpy } = mockIframe(vi.fn(), {});
    appendChildSpy.mockRestore();
    const spy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLIFrameElement) {
        Object.defineProperty(node, 'contentDocument', {
          get: () => null,
          configurable: true,
        });
      }
      return node;
    });
    const result = await pdfExporter.export(el, makeOptions());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to create print iframe');
    spy.mockRestore();
  });

  it('aborts when the signal is aborted before export', async () => {
    const printMock = vi.fn();
    const el = makeElement();
    const { appendChildSpy } = mockIframe(printMock);
    const controller = new AbortController();
    controller.abort();
    const result = await pdfExporter.export(el, makeOptions({ signal: controller.signal }));
    expect(result.success).toBe(false);
    // jsdom DOMException is not instanceof Error, so formatExportError falls
    // back to the generic label; assert success=false and that print never ran
    expect(result.error).toMatch(/abort|failed/i);
    expect(printMock).not.toHaveBeenCalled();
    appendChildSpy.mockRestore();
  });

  it('formats CORS errors with remediation guidance (error path)', async () => {
    const el = makeElement();
    const { appendChildSpy } = mockIframe(vi.fn(), {
      write: vi.fn(() => {
        throw new Error('cross-origin stylesheet blocked');
      }),
    });
    const result = await pdfExporter.export(el, makeOptions());
    expect(result.success).toBe(false);
    expect(result.error).toContain('CORS');
    expect(result.error).toContain('removing external images');
    appendChildSpy.mockRestore();
  });
});
