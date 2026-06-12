# Architecture

## Core Layers

- `src/app`: Next.js routes, metadata, and runtime wiring.
- `src/tool`: Tool-specific state shape, serializers, UI, and exporters.
- `packages/core`: Shared shell, hooks, engines, and public APIs.

## Data Flow

1. `src/tool/tool-definition.ts` defines `Tool<TState>` with serialize/deserialize logic and lazy-loaded exporter registration.
2. `useTool()` composes:
   - `useToolState()` for undo/redo and persistence
   - `useImport()` for file parsing and validation
   - `useExport()` for export orchestration
   - toast notifications for user feedback
3. `ToolShell` receives `toolbarActions` and renders toolbar/sidebar/canvas/status slots.

## Persistence

- State persistence uses `StorageManager`.
- History is tracked in `useToolState` and persisted separately.
- Keys are namespaced by tool id.

## Export Path

- `useExport()` delegates to `ExportEngine`.
- `ExportEngine` lazy-loads format exporters.
- Exporters render canvas via `html-to-image` (SVG foreignObject) and return `ExportResult`.

## Import Path

- `useImport()` validates size, extension, MIME, and structured JSON safety.
- Tool-level `deserialize()` validates typed state.

## UI Composition

- `ToolShell` is responsible for layout and keyboard shortcuts.
- Tool components stay focused on domain behavior.
- Optional UI additions are injected through `plugins`.

---

## Detailed Component Architecture

### State Management (`app/tool-client.tsx`)

The main client component (`ToolClient`) is the state orchestrator:

1. **Input Handling** — `handleOriginalChange` / `handleModifiedChange` clamp text to `MAX_TEXT_LENGTH` (500K chars), truncating excess with a toast notification.
2. **Diff Computation** — A single `computeRawDiff()` call produces the full unfiltered diff (shared across canvas, sidebar, and stats). For the unified view, a separate `filterDiffLines()` pass applies context-line filtering without recomputing the LCS.
3. **Performance** — Deferred values (`useDeferredValue`) keep the UI responsive for inputs >50K characters by allowing diff computation to yield to rendering. A stale-diff indicator (`isDiffStale`) warns the user when the display may be behind.
4. **Keyboard Shortcuts** — A global `keydown` handler on `window` maps `Ctrl/Cmd + key` combinations to view-mode switching, export, toggle options (whitespace, word-diff, wrapping, ignore-whitespace), swap, clear, and copy actions. Export shortcuts use `Ctrl+Shift+{E,P,J,W,D}`.
5. **Shareable URLs** — On mount, the URL `?state=<compressed>` parameter is decompressed via `lz-string` and deserialized to restore full state. The share button creates a compressed URL and offers it via the Web Share API or clipboard.
6. **Diff Stats** — Memoized from `rawDiffLines` (a single pass counting added/removed lines) and passed directly to both the toolbar and sidebar.

### Diff Algorithm (`components/tool-canvas.tsx`)

The diff engine is entirely client-side with no external diff libraries:

1. **LCS DP Table** — A flat `Uint32Array` stores the DP table (∼4 bytes per cell, ∼8× more memory-efficient than `number[][]`). Supports up to 20M cells (∼80 MB) before falling back.
2. **Backtracking** — Produces `DiffOp` entries (`added`, `removed`, `unchanged`) which are resolved into `DiffLine` objects with correct line numbers.
3. **Fast Paths** — Identical texts (`original === modified`), whitespace-identical (`ignoreWhitespace` + trimmed equality), or single-side-empty inputs bypass the LCS entirely (O(1) or O(n)).
4. **Chunked Fallback** — For inputs exceeding 20M cells, the input is split into 2000-line chunks with 50-line overlap. Each chunk runs the full LCS independently; results are stitched together at the overlap boundaries.
5. **Word-level Diff** — For each paired removed/added line, a second LCS pass at the token level highlights which words changed. Tokenization uses a regex that separates word characters (`\w+`) from whitespace runs (`\s+`) and treats each CJK character as its own token. A soft guard (10K token pairs) prevents runaway computation.
6. **Context Filtering** — `filterDiffLines()` collapses unchanged lines far from changes, inserting hunk headers (`@@ -start,count +start,count @@`) for collapsed ranges, or `...` when line numbers don't align.

### Unified Diff String (`components/tool-canvas.tsx`)

`generateUnifiedDiffString()` produces GNU-style unified diff output:

1. Uses the pre-computed full diff (avoids re-running LCS when available).
2. Groups changed indices into hunks separated by more than `2×contextLines` unchanged lines.
3. Each hunk has a proper header (`@@ -oldStart,oldCount +newStart,newCount @@`).
4. Lines are prefixed: ` ` (unchanged), `+` (added), `-` (removed).

### UI Components

#### ToolCanvas
- Renders one of three view modes based on `viewMode` state: side-by-side, unified, or split.
- Tabs switch views with keyboard navigation (ArrowLeft/Right, Home, End) following WAI-ARIA tab pattern.
- Memoized sub-components (`DiffLineRow`, `DiffLineContent`) minimize re-renders on text input.
- Line wrapping is applied via a CSS class toggle (`diff-canvas-wrap`).

#### ToolSidebar
- Read-only statistics: line/character counts for both panels, addition/deletion totals.
- Checkbox controls: Show Whitespace, Word Diff, Wrap Lines, Ignore Whitespace.
- Conditional context-lines number input (only shown in unified view).
- Action buttons: Swap, Clear (danger variant), Copy Unified Diff, Copy as JSON, Copy Original Text, Copy Modified Text.
- All interactive elements have `aria-label` for screen reader accessibility.
- Keyboard shortcut hints rendered as `<kbd>` elements (hidden on mobile).

#### ToolToolbar
- Displays context-aware stats: original/modified line and character counts, diff change counts, active flags (WS/WD/WR/IW), current view mode.
- Large-input warning threshold at 100K characters (before the 500K truncation boundary).
- Shown in the `ToolShell` toolbar slot alongside `ImportExport` component.

### Styling (`globals.css` + `diff-viewer.css`)

- **CSS Custom Properties**: All colors, shadows, and layout tokens use CSS variables defined in `globals.css`, with light, dark (`[data-theme='dark']`), high-contrast (`[data-contrast='more']`), and dark+high-contrast variants.
- **Component Styles**: `diff-viewer.css` contains component-specific styles for the diff display: line rows, hunk headers, word-level highlights, panel headers, textareas, tabs, sidebar sections, and responsive breakpoints (768px, 480px).
- **Print**: Comprehensive print styles hide interactive elements (toolbar, sidebar, status bar), force ink-friendly colors, and break-inside-avoid for diff rows.
- **Reduced Motion**: `prefers-reduced-motion` disables animations and transitions.
- **Focus**: All interactive elements have clear `:focus-visible` outlines using the accent color.

### Exporters (`exporters/`)

- **Raster images** (PNG, JPEG, WebP): `createCanvasExporter()` factory in `utils.ts` uses `html-to-image` to capture the DOM element as a canvas, then converts to the target format via `canvas.toBlob()`. Supports configurable quality for lossy formats.
- **`renderToImage()`**: Moves the element to an off-screen container, expands scrollable areas (textareas), inlines computed background color, and captures at 2× resolution. All DOM mutations are restored in a `finally` block.
- **PDF**: Uses `window.print()` with a dedicated `@media print` stylesheet. Falls back to embedding a raster canvas image when DOM-based rendering fails.

### Testing

- **Unit tests** (Vitest): Located in `__tests__/unit/`. Cover diff computation (basic cases, word-level, context filtering, edge cases, chunked fallback), sidebar components, toolbar, and export utilities.
- **E2E tests** (Playwright): Located in `__tests__/e2e/`. Run across Chromium, Firefox, WebKit, and mobile viewports.