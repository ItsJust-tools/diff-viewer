/**
 * Clipboard helpers with a graceful fallback for insecure origins and
 * permission rejections.
 *
 * `navigator.clipboard.writeText` rejects when the page is loaded over HTTP
 * (insecure origin), inside an unauthenticated iframe, or when the browser
 * denies clipboard permissions by policy. In those cases we fall back to the
 * legacy `document.execCommand('copy')` approach using an off-screen textarea.
 */

/** Whether the async Clipboard API is available in this environment. */
function isClipboardApiAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  );
}

/**
 * Fallback copy using `document.execCommand('copy')` with an off-screen
 * textarea. Returns true on success, false otherwise.
 */
function copyWithExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Keep the element off-screen and non-interactive so it never flashes or
  // steals focus from the user.
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.boxShadow = 'none';
  textarea.style.background = 'transparent';

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return success;
}

/**
 * Copy `text` to the clipboard, preferring the async Clipboard API and
 * falling back to `document.execCommand('copy')` when it is unavailable or
 * rejects (e.g. insecure origin, permission denied, unauthenticated iframe).
 *
 * Resolves to `true` when the text was copied. When every strategy fails it
 * throws the original error (or a generic one) so callers can surface
 * meaningful feedback to the user.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  let primaryError: unknown;
  if (isClipboardApiAvailable()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Fall through to the execCommand fallback, remembering the original
      // error so we can surface it if the fallback also fails.
      primaryError = error;
    }
  }
  if (copyWithExecCommand(text)) {
    return true;
  }
  if (primaryError !== undefined) {
    throw primaryError;
  }
  throw new Error('Copy failed');
}
