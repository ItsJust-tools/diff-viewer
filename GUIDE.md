# itsjust Template — Developer Guide

This guide walks you through creating a new tool with the itsjust template.

## Table of Contents

1. [Philosophy](#philosophy)
2. [Quick Start](#quick-start)
3. [Copy Template → Rename → Ship](#copy-template--rename--ship)
4. [The Tool Contract](#the-tool-contract)
5. [Tool Configuration](#tool-configuration)
6. [State Management](#state-management)
7. [Canvas, Toolbar & Sidebar](#canvas-toolbar--sidebar)
8. [Export & Import](#export--import)
9. [Share](#share)
10. [Styling](#styling)
11. [SEO & Metadata](#seo--metadata)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [LLM Handoff](#llm-handoff)
15. [Troubleshooting](#troubleshooting)

---

## Philosophy

Each itsjust tool does **one thing** and does it well. No bloat, no signups, no confusing menus. Think:

- UML Activity Diagram Maker
- Pixel Art Editor
- Color Palette Generator
- ASCII Table Builder

Not: "All-in-one design suite".

---

## Quick Start

```bash
# 1. Create your repo from this template
git clone https://github.com/YOU/your-tool.git
cd your-tool
npm install

# 2. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Copy Template → Rename → Ship

### Local Development Path

```bash
# 1. Copy template
git clone https://github.com/ItsJust-tools/template.git my-tool
cd my-tool
rm -rf .git
git init
git add .
git commit -m "init from itsjust template"

# 2. Rename (edit files, then run preflight)
node scripts/preflight.mjs

# 3. Verify
npm run lint && npm test && npm run build

# 4. Ship
git remote add origin https://github.com/YOU/my-tool.git
git push -u origin main
```

### Vercel Path

```bash
# 1. Use GitHub template button (creates repo instantly)
# 2. Clone your new repo
git clone https://github.com/YOU/my-tool.git
cd my-tool
npm install

# 3. Edit src/tool/tool.config.ts & src/tool/tool-definition.ts
# 4. Run preflight
node scripts/preflight.mjs

# 5. Deploy
npx vercel
# Or connect GitHub repo in Vercel dashboard for auto-deploys
```

---

## The Tool Contract

Every tool must implement the `Tool` interface from `@itsjust/core`:

```ts
import type { Tool } from '@itsjust/core';

export const myTool: Tool<MyState> = {
  id: 'pixel-art',
  name: 'Pixel Art',
  version: '1.0.0',
  config: toolConfig,
  initialState: { grid: [], color: '#000' },
  serialize: (state) => JSON.stringify(state),
  deserialize: (data) => {
    // Validate and parse imported data
    if (typeof data !== 'object' || data === null) {
      return { success: false, error: 'Invalid data: expected object' };
    }
    const record = data as Record<string, unknown>;
    return {
      success: true,
      data: {
        grid: Array.isArray(record.grid) ? record.grid : [],
        color: typeof record.color === 'string' ? record.color : '#000',
      },
    };
  },
  exporters: [{ format: 'png', loader: () => import('./exporters/png') }],
};
```

| Field          | Purpose                                        |
| -------------- | ---------------------------------------------- |
| `id`           | Storage key prefix, share file identifier      |
| `name`         | Human-readable name                            |
| `version`      | Share file schema version                      |
| `config`       | `ToolConfig` — features, export formats, theme |
| `initialState` | State when the tool first loads                |
| `serialize`    | Convert state to string for export/share       |
| `deserialize`  | Recover state from imported data               |

### Why a contract?

The contract lets `useTool()` handle all the boring stuff — undo/redo, auto-save, export, import, share — so you only write the code that's unique to your tool.

---

## Tool Configuration

Edit `src/tool/tool.config.ts`:

```ts
const toolConfig: ToolConfig = {
  id: 'pixel-art',
  name: 'Pixel Art',
  description: 'Create pixel art in your browser',
  version: '1.0.0',
  exportFormats: ['json'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#ef4444',
    accentHover: '#dc2626',
    accentSubtle: 'rgba(239, 68, 68, 0.08)',
    brand: 'Pixel Art',
    icon: '🎨',
  },
};
```

Toggle `features` to enable/disable UI sections. If `sidebar: false`, the sidebar toggle button and resize handle disappear automatically.

---

## State Management

`useTool()` returns a `state` object powered by `useToolState`:

```ts
const tool = useTool(myTool, canvasRef);

tool.state.data; // current state
tool.state.setData(updater); // update state (debounced history)
tool.state.undo(); // undo
tool.state.redo(); // redo
tool.state.canUndo; // boolean
tool.state.canRedo; // boolean
tool.state.isDirty; // unsaved changes?
tool.state.lastSaved; // Date | null
tool.state.saveNow(); // force save immediately
```

### Wiring it up in `tool-client.tsx`

```tsx
export default function ToolClient() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const tool = useTool(myTool, canvasRef);
  const [sidebarOpen, setSidebarOpen] = useState(toolConfig.features.sidebar);

  return (
    <ToolShell
      config={toolConfig}
      actions={tool.toolbarActions}
      sidebarOpen={sidebarOpen}
      onSidebarChange={setSidebarOpen}
      toolbar={
        <>
          <ToolToolbar state={tool.state.data} />
          <ImportExport
            formats={tool.supportedFormats}
            onExport={tool.handleExport}
            onImport={tool.importFromFile}
          />
        </>
      }
      sidebar={<ToolSidebar state={tool.state.data} />}
      canvas={<ToolCanvas canvasRef={canvasRef} state={tool.state.data} />}
      statusBar={<span>{tool.state.data.markdown.length} chars</span>}
    />
  );
}
```

---

## Canvas, Toolbar & Sidebar

### Canvas

The canvas is where your tool lives. It receives:

- `canvasRef` — needed for PNG/JPEG/WebP/PDF export (`html-to-image` serializes this element into an SVG foreignObject)
- `state` — current tool state
- `logic` — tool-specific action creators
- The default layout is full-space and responsive, so it fills the available viewport instead of simulating an A4 page

```tsx
export function ToolCanvas({ canvasRef, state, logic }: ToolCanvasProps) {
  return (
    <div ref={canvasRef} className="my-canvas">
      {/* Your tool UI */}
    </div>
  );
}
```

**Important:** Wrap your actual UI in a `div` with `ref={canvasRef}` if you want image/PDF export to work. Text-based exports (JSON) use `serialize()` instead.

### Toolbar

Add buttons between the brand and the built-in Export/Share buttons:

```tsx
export function ToolToolbar({ state, logic }: ToolToolbarProps) {
  return (
    <div className="tool-toolbar-items">
      <button onClick={logic.clearCanvas}>Clear</button>
      <button onClick={logic.downloadPattern}>Pattern</button>
    </div>
  );
}
```

### Sidebar

The sidebar is resizable (drag the right edge) and collapsible (Ctrl+B or the toolbar button). Put tool options here:

```tsx
export function ToolSidebar({ state, logic }: ToolSidebarProps) {
  return (
    <div className="tool-sidebar">
      <label>Brush size</label>
      <input type="range" min="1" max="10" />
    </div>
  );
}
```

---

## Export & Import

### Supported Formats

| Format | How it works                | Requires canvas ref |
| ------ | --------------------------- | ------------------- |
| `json` | `serialize(state)`          | No                  |
| `png`  | `html-to-image` → blob      | Yes                 |
| `jpeg` | `html-to-image` → blob      | Yes                 |
| `webp` | `html-to-image` → blob      | Yes                 |
| `pdf`  | `@media print` iframe → PDF | Yes                 |

Set `exportFormats` in `tool.config.ts` to control which formats appear in the Export dropdown.

### Custom serialization

`serialize` and `deserialize` in your `Tool` contract control JSON export/import:

```ts
serialize: (state) => JSON.stringify({ pixels: state.grid, palette: state.palette }),
deserialize: (data) => {
  if (typeof data !== 'object' || data === null) {
    return { success: false, error: 'Invalid data format' };
  }
  const record = data as Record<string, unknown>;
  return {
    success: true,
    data: {
      grid: Array.isArray(record.pixels) ? record.pixels : [],
      palette: Array.isArray(record.palette) ? record.palette : ['#000'],
    },
  };
},
```

### `.itsjust.json` files

The share format is automatically handled by `useTool`. Users can import `.itsjust.json` files created by any itsjust tool. The framework validates `$schema: 'itsjust-tool'` and calls your `deserialize` with the `content` field.

**Canonical share schema:**

```json
{
  "$schema": "itsjust-tool",
  "toolId": "your-tool-id",
  "version": "1.0",
  "content": {
    /* your state shape */
  },
  "createdAt": "2026-04-22T12:00:00Z",
  "metadata": { "schemaVersion": "1.0" }
}
```

---

## Share

Share methods are provided by `useShare` from `@itsjust/core`:

1. **Download .itsjust.json** — `downloadShareFile()`
2. **Web Share API** — `shareViaWeb()` (opens native share sheet on mobile)
3. **Copy to Clipboard** — `copyShareToClipboard()`
4. **Shareable URL** — current tool state is encoded into URL query params and auto-loaded on open

All are 100% client-side. No server required.

---

## Styling

### Global theme

Edit CSS custom properties in `src/app/globals.css`:

```css
:root {
  --accent: #ef4444;
  --accent-hover: #dc2626;
  --background: #f1f5f9;
  /* ... */
}
```

### Tool-specific styles

Add tool-specific CSS to `src/app/globals.css`:

```css
.my-canvas {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: 1px;
}

.my-pixel {
  aspect-ratio: 1;
  border: 1px solid var(--border);
}
```

### Dark mode

Dark mode variables are in the `[data-theme='dark']` block in `globals.css`. The framework handles toggling automatically — you don't need to write any dark mode logic.

### Accessibility Requirements

Accessibility is a must-have requirement for all tools built from this template. Every change must preserve keyboard-only operation, visible focus states, semantic landmarks, readable contrast, and screen-reader-friendly labels/status messages.

---

## SEO & Metadata

The template uses a **single source of truth** pattern:

1. `src/tool/tool.config.ts` — tool identity (name, description)
2. `src/tool/template-metadata.ts` — locale, language, PWA metadata
3. `src/lib/seo.ts` — generates Next.js `Metadata` and JSON-LD from the above

You rarely need to edit `src/lib/seo.ts`. Just customize `tool.config.ts` and `template-metadata.ts`.

### Open Graph Image

Replace `public/og.svg` with your tool's Open Graph image (1200x630px).

### PWA Manifest

`src/app/manifest.ts` is auto-generated from `template-metadata.ts`. No manual editing needed.

---

## Testing

### Unit tests

Test your tool logic with Vitest:

```ts
// __tests__/unit/tool/pixel-art.test.ts
import { describe, it, expect } from 'vitest';

function setPixel(grid: string[][], x: number, y: number, color: string) {
  return grid.map((row, ry) => (ry === y ? row.map((c, rx) => (rx === x ? color : c)) : row));
}

describe('setPixel', () => {
  it('changes the color at the given coordinate', () => {
    const grid = [
      ['#fff', '#fff'],
      ['#fff', '#fff'],
    ];
    expect(setPixel(grid, 0, 1, '#f00')).toEqual([
      ['#fff', '#fff'],
      ['#f00', '#fff'],
    ]);
  });
});
```

### Component tests

Use `@itsjust/core/testing`:

```ts
import { renderTool } from '@itsjust/core/testing';

test('canvas renders', () => {
  renderTool(<ToolCanvas state={initialState} logic={mockLogic} />);
  expect(screen.getByRole('main')).toBeInTheDocument();
});
```

### E2E tests

Playwright tests live in `__tests__/e2e/`:

```ts
// __tests__/e2e/tool.spec.ts
import { test, expect } from '@playwright/test';

test('exports json', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Export');
  await page.click('text=JSON Data');
  // assert download
});
```

---

## Deployment

1. Push to GitHub
2. Import repo in [Vercel](https://vercel.com)
3. Set `NEXT_PUBLIC_URL` (optional, defaults to `http://localhost:3000`)
4. Done — zero build config needed

This template is privacy-first by default: no API routes are required for tool interactions, imports, exports, or sharing.

---

## LLM Handoff

When handing this codebase to an LLM (e.g., Claude, GPT), provide these exact instructions:

### What to Edit

| Target                          | Rule                                                           |
| ------------------------------- | -------------------------------------------------------------- |
| `src/tool/tool.config.ts`       | Always start here. Set id, name, description, features, theme. |
| `src/tool/tool-definition.ts`   | Define state shape, serialize, deserialize, exporters.         |
| `src/tool/components/*.tsx`     | Canvas, toolbar, sidebar. Keep them focused.                   |
| `src/app/tool-client.tsx`       | Wire components. Don't add business logic here.                |
| `src/tool/template-metadata.ts` | Set locale, language, app name.                                |
| `public/og.svg`                 | Replace with tool-specific OG image.                           |

### Strict Do / Don't

- ✅ **Do** use `useTool()` — it handles state, undo, export, import.
- ✅ **Do** return `{ success: true, data }` or `{ success: false, error }` from `deserialize`.
- ✅ **Do** keep canvas logic in `src/tool/components/tool-canvas.tsx`.
- ✅ **Do** preserve project philosophy in every change: single-purpose UX, privacy-first defaults, and mandatory accessibility.
- ✅ **Do** prefer minimal, reversible changes that fit existing architecture.
- ✅ **Do** flag template-level bugs as template bugs and recommend updating the template baseline.
- ❌ **Don't** modify files in `packages/core/` unless fixing a core bug.
- ❌ **Don't** add server-side API routes. This template is 100% client-side.
- ❌ **Don't** use `useEffect` for state updates. Use `useCallback` with handlers.
- ❌ **Don't** read `window` or `localStorage` during render. Use `useEffect` or lazy init.
- ❌ **Don't** add `any` types. Use `unknown` + type guards.
- ❌ **Don't** import from `@itsjust/core` internals. Only use the public API.
- ❌ **Don't** add “nice-to-have” complexity (extra panels, settings, wizards) unless explicitly required.
- ❌ **Don't** silently alter template baseline data/contracts to paper over a template issue.

### LLM Guardrails (Required)

- Every AI-generated change must pass this gate before merge:
  - Keeps the tool focused on one primary job.
  - Does not send user content to servers by default.
  - Maintains or improves accessibility behavior.
  - Updates docs/changelog when behavior changes.
- If a user request conflicts with these rules, the LLM must call out the conflict and ask for explicit approval before proceeding.
- If a defect originates in the template baseline, the LLM must explicitly say that the template needs an upstream update.

### Public API of `@itsjust/core`

```ts
// Components
export { ToolShell, ImportExport, ThemeProvider, ToastProvider, KeyboardShortcutsOverlay };

// Hooks
export {
  useTool,
  useToolState,
  useExport,
  useImport,
  useShare,
  useStorage,
  useDragAndDropImport,
  useKeyboardShortcuts,
  useRelativeTime,
};

// Engines
export { ExportEngine, StorageManager, createExportEngine };

// Types
export type {
  Tool,
  ToolConfig,
  ToolState,
  ExportFormat,
  ExportOptions,
  ExportResult,
  ImportResult,
  DeserializeResult,
  StorageLoadResult,
  Theme,
  ToolTheme,
  ToolPlugin,
};

// Testing
export { renderTool, createMockToolState } from './testing';
```

---

## Troubleshooting

### Export produces blank image

Make sure `canvasRef` is attached to the element you want to capture. The exporter temporarily moves the element off-screen with unlimited space, so `display: none` is not required — but the element must have a measurable `offsetWidth`.

### Hydration mismatch

Don't read `window` or `localStorage` during render. Use `useEffect` or the lazy initializer pattern shown in `ThemeToggle`.

### Tests fail with "scrollIntoView is not a function"

Mock it in your test setup:

```ts
Element.prototype.scrollIntoView = vi.fn();
```

### Tests fail with "file.text is not a function"

The jsdom environment doesn't implement `Blob.prototype.text`. The template already polyfills this in `vitest.setup.ts`.

### Preflight fails with stale references

Run `node scripts/preflight.mjs` after renaming. It checks for hardcoded template values like `itsjust.tools`, `My Tool`, and `template-tool`.

### Build fails with module not found

Run `npm run build -w @itsjust/core` before `next build`.

---

## File Checklist for a New Tool

- [ ] `src/tool/tool.config.ts` — id, name, features, theme
- [ ] `src/tool/tool-definition.ts` — `Tool` contract (serialize, deserialize)
- [ ] `src/tool/types.ts` — your tool's state type
- [ ] `src/tool/template-metadata.ts` — locale, language, PWA metadata
- [ ] `src/tool/components/tool-canvas.tsx` — main UI
- [ ] `src/tool/components/tool-toolbar.tsx` — extra toolbar buttons
- [ ] `src/tool/components/tool-sidebar.tsx` — options panel
- [ ] `src/app/tool-client.tsx` — wire everything together
- [ ] `src/app/page.tsx` — SEO metadata (auto-derived)
- [ ] `public/og.svg` — Open Graph image
- [ ] `__tests__/unit/tool/` — unit tests
- [ ] `__tests__/e2e/tool.spec.ts` — E2E tests
- [ ] `node scripts/preflight.mjs` — passes with zero errors

That's it. One tool, one purpose, no bloat.
