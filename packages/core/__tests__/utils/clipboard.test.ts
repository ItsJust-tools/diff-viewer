import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyTextToClipboard } from '../../src/utils/clipboard';

describe('copyTextToClipboard', () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
      writable: true,
    });
  });

  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard('hello');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Not allowed to write'));
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });

    const execCommand = vi.fn().mockReturnValue(true);
    const textarea = {
      value: '',
      setAttribute: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      style: {},
    };
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: vi.fn(() => textarea),
        execCommand,
        body: { appendChild, removeChild },
      },
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard('fallback text');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('fallback text');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
  });

  it('falls back to execCommand when the Clipboard API is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const execCommand = vi.fn().mockReturnValue(true);
    const textarea = {
      value: '',
      setAttribute: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      style: {},
    };
    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: vi.fn(() => textarea),
        execCommand,
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
      },
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard('no api');
    expect(result).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('throws the original error when both strategies fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });

    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: vi.fn(() => ({
          value: '',
          setAttribute: vi.fn(),
          select: vi.fn(),
          setSelectionRange: vi.fn(),
          style: {},
        })),
        execCommand,
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
      },
      configurable: true,
      writable: true,
    });

    await expect(copyTextToClipboard('nope')).rejects.toThrow('denied');
  });

  it('throws a generic error when no Clipboard API and execCommand fails', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: vi.fn(() => ({
          value: '',
          setAttribute: vi.fn(),
          select: vi.fn(),
          setSelectionRange: vi.fn(),
          style: {},
        })),
        execCommand,
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
      },
      configurable: true,
      writable: true,
    });

    await expect(copyTextToClipboard('nope')).rejects.toThrow('Copy failed');
  });

  it('throws a generic error when execCommand throws', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const execCommand = vi.fn().mockImplementation(() => {
      throw new Error('execCommand failed');
    });
    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: vi.fn(() => ({
          value: '',
          setAttribute: vi.fn(),
          select: vi.fn(),
          setSelectionRange: vi.fn(),
          style: {},
        })),
        execCommand,
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
      },
      configurable: true,
      writable: true,
    });

    await expect(copyTextToClipboard('throws')).rejects.toThrow('Copy failed');
  });
});
