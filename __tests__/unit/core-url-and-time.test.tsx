import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRelativeTime } from '../../packages/core/src/hooks/use-relative-time';
import { useUrlState } from '../../packages/core/src/hooks/use-url-state';
import { t, strings } from '../../packages/core/src/i18n/strings';
import { compressToEncodedURIComponent } from 'lz-string';

const clipboardMock = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../packages/core/src/utils/clipboard', () => clipboardMock);

interface UrlStateOptions {
  toolId: string;
  serialize: () => string;
  deserialize: (
    data: unknown
  ) => { success: true; data: unknown } | { success: false; error: string };
  onStateLoaded: (data: unknown) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

function optionsFor(overrides: Partial<UrlStateOptions> = {}): UrlStateOptions {
  return {
    toolId: 'test-tool',
    serialize: () => JSON.stringify({ title: 'shared' }),
    deserialize: (data) =>
      typeof data === 'object' && data !== null
        ? { success: true, data }
        : { success: false, error: 'Invalid payload' },
    onStateLoaded: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
  };
}

describe('useUrlState', () => {
  let onStateLoaded: (data: unknown) => void;
  let showToast: (message: string, type: 'success' | 'error') => void;

  beforeEach(() => {
    onStateLoaded = vi.fn() as (data: unknown) => void;
    showToast = vi.fn() as (message: string, type: 'success' | 'error') => void;
    clipboardMock.copyTextToClipboard.mockReset().mockResolvedValue(true);
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    window.history.replaceState(null, '', 'http://localhost:3000/');
  });

  it('does nothing on mount without a state param', () => {
    const opts = optionsFor({ onStateLoaded, showToast });
    const { result } = renderHook(() => useUrlState(opts));
    expect(result.current.isSharing).toBe(false);
    expect(onStateLoaded).not.toHaveBeenCalled();
  });

  it('loads state from a shared URL on mount', async () => {
    const encoded = compressToEncodedURIComponent(JSON.stringify({ title: 'from-url' }));
    window.history.replaceState(null, '', `http://localhost:3000/?state=${encoded}`);
    const opts = optionsFor({ onStateLoaded, showToast });
    renderHook(() => useUrlState(opts));
    await act(async () => {});
    expect(onStateLoaded).toHaveBeenCalledWith({ title: 'from-url' });
    expect(showToast).toHaveBeenCalledWith('Loaded state from shared URL', 'success');
  });

  it('toasts an error for an invalid encoded state', async () => {
    window.history.replaceState(null, '', 'http://localhost:3000/?state=%%%invalid');
    const opts = optionsFor({ onStateLoaded, showToast });
    renderHook(() => useUrlState(opts));
    await act(async () => {});
    expect(onStateLoaded).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('toasts the deserialize error when the payload is invalid', async () => {
    const encoded = compressToEncodedURIComponent(JSON.stringify('not-an-object'));
    window.history.replaceState(null, '', `http://localhost:3000/?state=${encoded}`);
    const opts = optionsFor({ onStateLoaded, showToast });
    renderHook(() => useUrlState(opts));
    await act(async () => {});
    expect(showToast).toHaveBeenCalledWith('Invalid payload', 'error');
  });

  it('createShareUrl falls back to clipboard when Web Share API is missing', async () => {
    const opts = optionsFor({ onStateLoaded, showToast });
    const { result } = renderHook(() => useUrlState(opts));
    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.createShareUrl();
    });
    expect(returned).toContain('state=');
    expect(returned).toContain('tool=test-tool');
    expect(window.location.search).toContain('state=');
    expect(clipboardMock.copyTextToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('state=')
    );
    expect(showToast).toHaveBeenCalledWith('Share URL copied to clipboard', 'success');
    expect(result.current.isSharing).toBe(false);
  });

  it('createShareUrl uses navigator.share when title provided', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { writable: true, value: shareMock });
    const opts = optionsFor({ onStateLoaded, showToast });
    const { result } = renderHook(() => useUrlState(opts));
    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.createShareUrl('My Tool');
    });
    expect(shareMock).toHaveBeenCalled();
    expect(shareMock.mock.calls[0]![0].title).toBe('My Tool');
    expect(returned).toContain('state=');
    expect(showToast).toHaveBeenCalledWith('Share URL copied to clipboard', 'success');
  });

  it('createShareUrl swallows AbortError from the share dialog', async () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    const shareMock = vi.fn().mockRejectedValue(abort);
    Object.defineProperty(navigator, 'share', { writable: true, value: shareMock });
    const opts = optionsFor({ onStateLoaded, showToast });
    const { result } = renderHook(() => useUrlState(opts));
    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.createShareUrl('My Tool');
    });
    expect(shareMock).toHaveBeenCalled();
    expect(returned).toContain('state=');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('createShareUrl rejects non-abort share errors and returns null', async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error('share denied'));
    Object.defineProperty(navigator, 'share', { writable: true, value: shareMock });
    const opts = optionsFor({ onStateLoaded, showToast });
    const { result } = renderHook(() => useUrlState(opts));
    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.createShareUrl('My Tool');
    });
    expect(returned).toBeNull();
    expect(showToast).toHaveBeenCalledWith('share denied', 'error');
  });

  it('createShareUrl returns null when clipboard copy fails', async () => {
    clipboardMock.copyTextToClipboard.mockResolvedValue(false);
    const opts = optionsFor({ onStateLoaded, showToast });
    const { result } = renderHook(() => useUrlState(opts));
    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.createShareUrl();
    });
    expect(returned).toBeNull();
    expect(showToast).toHaveBeenCalledWith('Failed to copy share URL to clipboard', 'error');
  });
});

describe('useRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Ready for null or invalid dates', () => {
    expect(renderHook(() => useRelativeTime(null)).result.current).toBe('Ready');
    expect(renderHook(() => useRelativeTime('not-a-date')).result.current).toBe('Ready');
  });

  it('returns "Saved just now" for very recent timestamps', () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    expect(renderHook(() => useRelativeTime(recent)).result.current).toBe('Saved just now');
  });

  it('formats seconds, minutes, hours, days, months and years', () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(renderHook(() => useRelativeTime(ago(20_000))).result.current).toBe(
      'Saved 20 seconds ago'
    );
    expect(renderHook(() => useRelativeTime(ago(5 * 60_000))).result.current).toBe(
      'Saved 5 minutes ago'
    );
    expect(renderHook(() => useRelativeTime(ago(2 * 3_600_000))).result.current).toBe(
      'Saved 2 hours ago'
    );
    expect(renderHook(() => useRelativeTime(ago(3 * 86_400_000))).result.current).toBe(
      'Saved 3 days ago'
    );
    expect(renderHook(() => useRelativeTime(ago(6 * 30 * 86_400_000))).result.current).toBe(
      'Saved 6 months ago'
    );
    expect(renderHook(() => useRelativeTime(ago(2 * 365 * 86_400_000))).result.current).toBe(
      'Saved 2 years ago'
    );
  });

  it('refreshes periodically after mount', () => {
    const recent = new Date(Date.now() - 4000).toISOString();
    const { result } = renderHook(() => useRelativeTime(recent));
    expect(result.current).toBe('Saved just now');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe('Saved 9 seconds ago');
  });
});

describe('i18n strings', () => {
  it('returns plain strings and parameterized values', () => {
    expect(t('import')).toBe('Import');
    expect(t('exportSuccess', 'en', 'png')).toBe('Exported as .png');
    expect(Object.keys(strings.en).length).toBeGreaterThan(10);
  });
});
