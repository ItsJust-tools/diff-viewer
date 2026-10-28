import { test, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * End-to-end coverage for the core Diff Viewer workflows:
 *  1. Loading and editing both panels
 *  2. Undo / redo through buttons and keyboard shortcuts
 *  3. State persistence across reloads (auto-save + Ctrl/Cmd+S)
 *  4. Export triggers and exported payload verification
 *  5. Dark / light theme toggle persistence
 *  6. Import from file input and drag-and-drop, including corrupted files
 *  7. View mode switching, swap, and clear shortcuts
 *  8. Shell chrome: sidebar, shortcuts overlay, SEO metadata, 404
 */

const STATE_SLOT = '.status-slot-state';

/** Skip a test on the mobile Playwright projects, which use a different layout. */
function desktopOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name.includes('Mobile'), 'Desktop layout only');
}

async function gotoApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('.tool-shell')).toBeVisible();
  await expect(page.getByLabel('Original text', { exact: true })).toBeVisible();
}

async function fillPanels(page: Page, original: string, modified: string) {
  const originalBox = page.getByLabel('Original text', { exact: true });
  const modifiedBox = page.getByLabel('Modified text', { exact: true });
  await originalBox.fill(original);
  await modifiedBox.fill(modified);
}

/** Wait until the status bar reports a completed save. */
async function waitForSaved(page: Page, timeout = 10_000) {
  await expect(page.locator(STATE_SLOT)).toHaveText(/Saved/, { timeout });
}

/** Read the serialized JSON export payload from a download event. */
async function readDownload(download: import('@playwright/test').Download): Promise<Buffer> {
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  return readFile(filePath as string);
}

/** Open the export dropdown and click a format option. */
async function exportFormat(page: Page, option: RegExp) {
  await page.getByRole('button', { name: /export/i }).click({ force: true });
  const formatOption = page.getByRole('option', { name: option });
  await expect(formatOption).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await formatOption.click();
  return downloadPromise;
}

/** Dispatch a drag event with a single file attached onto the window. */
async function dispatchDrag(
  page: Page,
  type: 'dragenter' | 'drop',
  name: string,
  content: string,
  mimeType = 'application/json'
) {
  await page.evaluate(
    ({ eventType, fileName, fileType, fileContent }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([fileContent], fileName, { type: fileType }));
      window.dispatchEvent(
        new DragEvent(eventType, { dataTransfer, bubbles: true, cancelable: true })
      );
    },
    { eventType: type, fileName: name, fileType: mimeType, fileContent: content }
  );
}

/** Simulate a full drag-and-drop of a file onto the page. */
async function dropFile(page: Page, name: string, content: string, mimeType?: string) {
  await dispatchDrag(page, 'dragenter', name, content, mimeType);
  await dispatchDrag(page, 'drop', name, content, mimeType);
}

test.describe('load and edit', () => {
  test('tool loads with the diff viewer title', async ({ page }) => {
    await gotoApp(page);
    expect(await page.title()).toContain('Diff Viewer');
    await expect(page.getByRole('application', { name: 'Diff Viewer' })).toBeVisible();
  });

  test('both panels are editable and report their content', async ({ page }) => {
    await gotoApp(page);
    await fillPanels(page, 'hello world', 'hello there');
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('hello world');
    await expect(page.getByLabel('Modified text', { exact: true })).toHaveValue('hello there');
    // The toolbar summarizes both sides once text is present.
    await expect(page.locator('.diff-toolbar')).toContainText('1L');
  });

  test('unified view reports additions and deletions', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'alpha\nbeta\ngamma', 'alpha\nBETA\ngamma');
    await page.getByRole('tab', { name: /Unified/ }).click();
    await expect(page.getByRole('tab', { name: /Unified/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('region', { name: 'Unified diff output' })).toBeVisible();
    await expect(page.locator('.diff-header-diff-stats')).toContainText('addition');
  });

  test('identical text is reported as unchanged', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'same text', 'same text');
    await page.getByRole('tab', { name: /Unified/ }).click();
    await expect(page.getByText(/No differences/i)).toBeVisible();
  });
});

test.describe('undo and redo', () => {
  test('buttons reflect history state and restore text', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);

    const undoButton = page.getByRole('button', { name: 'Undo (Ctrl+Z)' });
    const redoButton = page.getByRole('button', { name: 'Redo (Ctrl+Y)' });
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await page.getByLabel('Original text', { exact: true }).fill('first version');
    await expect(undoButton).toBeEnabled();
    await expect(redoButton).toBeDisabled();

    await undoButton.click();
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('');
    await expect(redoButton).toBeEnabled();

    await redoButton.click();
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('first version');
    await expect(redoButton).toBeDisabled();
  });

  test('Ctrl+Z and Ctrl+Shift+Z dispatch through the shell', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);

    const original = page.getByLabel('Original text', { exact: true });
    await original.fill('typed once');
    await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toBeEnabled();

    await page.keyboard.press('Control+z');
    await expect(original).toHaveValue('');

    await page.keyboard.press('Control+Shift+z');
    await expect(original).toHaveValue('typed once');
  });

  test('Ctrl+Y also redoes', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);

    const original = page.getByLabel('Original text', { exact: true });
    await original.fill('redo me');
    await page.keyboard.press('Control+z');
    await expect(original).toHaveValue('');
    await page.keyboard.press('Control+y');
    await expect(original).toHaveValue('redo me');
  });
});

test.describe('state persistence', () => {
  test('panel contents survive a reload through auto-save', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'persisted original', 'persisted modified');
    await waitForSaved(page);

    await page.reload();
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue(
      'persisted original'
    );
    await expect(page.getByLabel('Modified text', { exact: true })).toHaveValue(
      'persisted modified'
    );
  });

  test('view mode and toggles survive a reload', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'a', 'b');
    await page.getByRole('tab', { name: /Split/ }).click();
    await page.keyboard.press('Control+i');
    await expect(page.locator('.diff-toolbar')).toContainText('IW');
    await waitForSaved(page);

    await page.reload();
    await expect(page.getByRole('tab', { name: /Split/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.diff-toolbar')).toContainText('IW');
  });

  test('Ctrl+S saves immediately without waiting for the debounce', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);

    await page.getByLabel('Original text', { exact: true }).fill('saved with shortcut');
    await expect(page.locator(STATE_SLOT)).toHaveText(/Unsaved/);

    // Auto-save debounce is 2s; a passing assertion inside 1.5s proves Ctrl+S did the save.
    await page.keyboard.press('Control+s');
    await expect(page.locator(STATE_SLOT)).toHaveText(/Saved/, { timeout: 1500 });

    const persisted = await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        (localStorage.getItem(key) ?? '').includes('saved with shortcut')
      )
    );
    expect(persisted).toBe(true);
  });

  test('state is restored together with the undo history', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await page.getByLabel('Original text', { exact: true }).fill('history entry');
    await waitForSaved(page);

    await page.reload();
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('history entry');
    await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toBeEnabled();
    await page.keyboard.press('Control+z');
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('');
  });
});

test.describe('export', () => {
  test('JSON export contains the current viewer state', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'export original', 'export modified');

    const download = await exportFormat(page, /JSON/);
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const payload = JSON.parse((await readDownload(download)).toString('utf8'));
    expect(payload.original).toBe('export original');
    expect(payload.modified).toBe('export modified');
    expect(payload.viewMode).toBe('side-by-side');
  });

  test('exported JSON can be imported back into a fresh session', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'roundtrip original', 'roundtrip modified');

    const download = await exportFormat(page, /JSON/);
    const contents = (await readDownload(download)).toString('utf8');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'roundtrip.json',
      mimeType: 'application/json',
      buffer: Buffer.from(contents),
    });

    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue(
      'roundtrip original'
    );
    await expect(page.getByLabel('Modified text', { exact: true })).toHaveValue(
      'roundtrip modified'
    );
  });

  test('image exports produce valid PNG, JPEG and WebP payloads', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'image original', 'image modified');

    const png = await exportFormat(page, /PNG/);
    expect(png.suggestedFilename()).toMatch(/\.png$/i);
    const pngBytes = await readDownload(png);
    expect(pngBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

    const jpeg = await exportFormat(page, /JPEG/);
    expect(jpeg.suggestedFilename()).toMatch(/\.(jpg|jpeg)$/i);
    const jpegBytes = await readDownload(jpeg);
    expect(jpegBytes.subarray(0, 2).toString('hex')).toBe('ffd8');

    const webp = await exportFormat(page, /webp/i);
    expect(webp.suggestedFilename()).toMatch(/\.webp$/i);
    const webpBytes = await readDownload(webp);
    expect(webpBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(webpBytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  test('PDF export opens the print dialog', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'pdf original', 'pdf modified');

    const consolePromise = new Promise<void>((resolve) => {
      const handler = (msg: import('@playwright/test').ConsoleMessage) => {
        if (msg.text().includes('__printIntercepted__')) {
          page.off('console', handler);
          resolve();
        }
      };
      page.on('console', handler);
    });

    await page.evaluate(() => {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLIFrameElement) {
              try {
                const frameWindow = node.contentWindow;
                if (frameWindow) frameWindow.print = () => console.log('__printIntercepted__');
              } catch {
                // cross-origin iframe, ignore
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    await page.getByRole('button', { name: /export/i }).click({ force: true });
    await page.getByRole('option', { name: /pdf/i }).click();
    await consolePromise;
  });

  test('Ctrl+Shift+E exports JSON', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'shortcut original', 'shortcut modified');

    const downloadPromise = page.waitForEvent('download');
    await page.keyboard.press('Control+Shift+E');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const payload = JSON.parse((await readDownload(download)).toString('utf8'));
    expect(payload.modified).toBe('shortcut modified');
  });
});

test.describe('theme', () => {
  test('dark/light toggle switches the theme attribute and persists', async ({ page }) => {
    await gotoApp(page);
    const html = page.locator('html');

    const toDark = page.getByRole('button', { name: /Switch to dark mode/i });
    await toDark.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('itsjust-theme'))).toBe('dark');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: /Switch to light mode/i }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('itsjust-theme'))).toBe('light');
  });

  test('high contrast toggle persists across reload', async ({ page }) => {
    await gotoApp(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-contrast', 'normal');

    await page.getByRole('button', { name: /Enable high contrast/i }).click();
    await expect(html).toHaveAttribute('data-contrast', 'more');

    await page.reload();
    await expect(html).toHaveAttribute('data-contrast', 'more');
  });
});

test.describe('import', () => {
  test('import from a JSON file applies the viewer state', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'state.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ original: 'imported original', modified: 'imported modified' })
      ),
    });

    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue(
      'imported original'
    );
    await expect(page.getByLabel('Modified text', { exact: true })).toHaveValue(
      'imported modified'
    );
  });

  test('drag-and-drop import shows the overlay and applies the state', async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);

    const payload = JSON.stringify({
      original: 'dropped original',
      modified: 'dropped modified',
    });
    await dispatchDrag(page, 'dragenter', 'dropped.json', payload);
    await expect(page.getByRole('status').filter({ hasText: 'Drop file to import' })).toBeVisible();

    await dispatchDrag(page, 'drop', 'dropped.json', payload);
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('dropped original');
    await expect(page.getByLabel('Modified text', { exact: true })).toHaveValue('dropped modified');
    await expect(page.locator('.drop-overlay')).toBeHidden();
  });

  test('corrupted file drag-and-drop surfaces an error and keeps state', async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await page.getByLabel('Original text', { exact: true }).fill('keep me');

    await dropFile(page, 'broken.json', '{ this is not json');

    await expect(page.locator('.toast-error').first()).toBeVisible();
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('keep me');
  });

  test('unsupported file type is rejected with a toast', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('plain text'),
    });

    await expect(page.locator('.toast-error').first()).toBeVisible();
    await expect(page.locator('.toast-error').first()).toContainText(/Unsupported|Unexpected/i);
  });
});

test.describe('view modes and shortcuts', () => {
  test('Ctrl+1/2/3 switch view modes', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'one', 'two');

    await page.keyboard.press('Control+2');
    await expect(page.getByRole('tab', { name: /Unified/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await page.keyboard.press('Control+3');
    await expect(page.getByRole('tab', { name: /Split/ })).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Control+1');
    await expect(page.getByRole('tab', { name: /Side-by-Side/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('Ctrl+Shift+S swaps original and modified text', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'left side', 'right side');

    await page.keyboard.press('Control+Shift+S');
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('right side');
    await expect(page.getByLabel('Modified text', { exact: true })).toHaveValue('left side');
  });

  test('Ctrl+Shift+Backspace clears both panels', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'to be cleared', 'also cleared');

    await page.keyboard.press('Control+Shift+Backspace');
    await expect(page.getByLabel('Original text', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Modified text', { exact: true })).toHaveValue('');
  });

  test('Ctrl+. toggles whitespace visualization', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    await fillPanels(page, 'a', 'b');
    await expect(page.locator('.diff-toolbar')).toContainText('WS');

    await page.keyboard.press('Control+.');
    await expect(page.locator('.diff-toolbar')).not.toContainText('WS');
  });

  test('keyboard shortcuts overlay opens and closes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'Overlay is desktop-only');
    await gotoApp(page);

    await page.getByRole('button', { name: /keyboard shortcuts/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Ctrl+Z');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('shell', () => {
  test('sidebar toggle collapses and expands', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    const sidebar = page.locator('.tool-shell-sidebar');
    await expect(sidebar).toHaveClass(/open/);

    await page.locator('.toolbar-btn-sidebar').click();
    await expect(sidebar).toHaveClass(/collapsed/);

    await page.locator('.toolbar-btn-sidebar').click();
    await expect(sidebar).toHaveClass(/open/);
  });

  test('Ctrl+B toggles the sidebar', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await gotoApp(page);
    const sidebar = page.locator('.tool-shell-sidebar');
    await expect(sidebar).toHaveClass(/open/);

    await page.keyboard.press('Control+b');
    await expect(sidebar).toHaveClass(/collapsed/);

    await page.keyboard.press('Control+b');
    await expect(sidebar).toHaveClass(/open/);
  });

  test('mobile sidebar backdrop closes the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('.tool-shell')).toBeVisible();

    const sidebar = page.locator('.tool-shell-sidebar');
    if ((await sidebar.getAttribute('class'))?.includes('collapsed')) {
      await page.getByRole('button', { name: /options/i }).click();
    }
    await expect(sidebar).toHaveClass(/open/);

    await page.locator('.sidebar-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(sidebar).toHaveClass(/collapsed/);
  });

  test('skip link targets the main content region', async ({ page }) => {
    await gotoApp(page);
    const skipLink = page.locator('a.skip-link').first();
    await expect(skipLink).toHaveAttribute('href', '#tool-canvas');
  });
});

test.describe('site metadata', () => {
  test('SEO meta tags are present', async ({ page }) => {
    await page.goto('/');
    expect(await page.title()).toBeTruthy();
    expect(await page.getAttribute('meta[name="description"]', 'content')).toBeTruthy();
    expect(await page.getAttribute('meta[property="og:title"]', 'content')).toBeTruthy();
    expect(await page.getAttribute('meta[property="og:image"]', 'content')).toBeTruthy();
    expect(await page.getAttribute('link[rel="canonical"]', 'href')).toBeTruthy();
  });

  test('JSON-LD structured data is present', async ({ page }) => {
    await page.goto('/');
    const content = await page.locator('script[type="application/ld+json"]').first().textContent();
    const parsed = JSON.parse(content ?? '{}');
    expect(parsed['@type']).toBe('WebApplication');
    expect(parsed.name).toBeTruthy();
    expect(parsed.offers.price).toBe('0');
    expect(parsed.featureList).toContain('Undo & Redo');
  });

  test('sitemap.xml is accessible', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    expect(response?.ok()).toBe(true);
    expect(await response?.text()).toContain('urlset');
  });

  test('robots.txt is accessible', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.ok()).toBe(true);
    expect(await response?.text()).toMatch(/User-[Aa]gent/);
  });

  test('404 page works', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    expect(response?.headers()['content-type'] ?? '').toContain('text/html');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('default view renders the tool shell', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tool-shell-canvas');
    await expect(page.locator('.tool-shell')).toBeVisible();
  });
});
