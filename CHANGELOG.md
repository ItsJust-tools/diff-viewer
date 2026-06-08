# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Export keyboard shortcuts**: Added `Ctrl+Shift+J` (JPEG), `Ctrl+Shift+W` (WebP), and `Ctrl+Shift+D` (PDF) shortcuts alongside the existing JSON and PNG shortcuts. Refactored to a unified export key map for consistency.
- **Enhanced sidebar option labels**: Each checkbox option now has a brief description below it explaining what it does (e.g., "Visualize spaces (·) and tabs (→)", "Highlight added/removed words within lines") for improved discoverability.
- **README keyboard shortcuts table**: Documented the new JPEG, WebP, and PDF export shortcuts.

### Fixed

- **Duplicate shortcut `Ctrl+Shift+J`**: The shortcut was shared between "Export as JPEG" and "Copy state as JSON". The keyboard handler resolved this silently (export takes priority), but the config and README showed the conflict. Changed "Copy as JSON" to `Ctrl+Shift+Y` for unambiguous operation.
- **Dead branch in word-diff pairing**: Removed an unreachable `else if (line.type !== 'unchanged')` branch in `applyWordDiffPairing`. Replaced with a clearer `else` clause that resets the pending remove queue on unchanged lines, matching the documented intent.

### Changed

- **Optimized diff lines computation**: Removed the redundant `filterDiffLines(rawDiffLines, -1)` call — `rawDiffLines` is already the full unfiltered diff, so no additional filtering is needed.
- **Cleaned up ToolToolbar stats**: Replaced the `useMemo` + null-object pattern with direct computed constants, eliminating the non-null assertion (`stats!`) for safer code.

### Fixed

- **Version sync**: `tool.config.ts` now derives its `version` from `package.json` via `packageJson.version`, eliminating the drift where `package.json` declared 1.7.0 but the tool config reported 1.8.0. Added `toolVersion` export alongside `templateBaseVersion`.
- **CONTRIBUTING.md template references**: Replaced stale template repo URL with the correct `ItsJust-tools/diff-viewer.git` so contributors open the right repo.

### Added

- **High-contrast CSS improvements**: Enhanced `[data-contrast='more']` support for diff row backgrounds and word-level diff highlights — added stronger contrast variants with thicker borders and bolder text in both light and dark high-contrast modes.
- **Accessibility attributes**: Added `aria-label` to all sidebar interactive elements (checkboxes, number input, action buttons) and diff line rows. Marked `<kbd>` decorative shortcut hints as `aria-hidden="true"`. Added `role="region"` to sidebar wrapper for better screen reader landmark navigation.

### Changed

- **Bumped version to 1.7.0** for accessibility and high-contrast improvements.

### Added

- **Ctrl+Shift+C shortcut**: New keyboard shortcut to copy unified diff to clipboard.
- **Optimized LCS memory**: Replaced `number[][]` DP table with a single `Uint16Array` flat buffer (~8× memory reduction per cell), allowing the O(m×n) guard to double to 20M cells before falling back to chunked diff.

### Fixed

- **Removed duplicate JSDoc block**: Cleaned up a stray duplicate JSDoc comment that appeared before the `ToolCanvasProps` interface in `tool-canvas.tsx`.
- **Simplified `useDeferredValue` call**: Removed a no-op ternary in `tool-client.tsx` that always passed the same value regardless of the `isLargeInput` flag.

### Changed

- **Improved multi-line word diff pairing**: `applyWordDiffPairing` now handles consecutive removed lines followed by consecutive added lines, pairing them in FIFO order (1st removed ↔ 1st added, 2nd removed ↔ 2nd added, etc.) instead of only pairing the first removed with the first added.

### Changed

- **Bumped version to 1.6.0** for the above improvements.

### Added

- **displayName for all exported components**: Added explicit `displayName` to `ToolCanvas`, `ToolSidebar`, `ToolToolbar`, `DiffLineRow`, `DiffLineContent`, and `TabButton` for React DevTools.
- **generateUnifiedDiffString utility**: Extracted LCS-based unified diff generation into a shared, exported function in `tool-canvas.tsx`, eliminating the duplicate implementation in `tool-client.tsx`.

### Changed

- **Single-diff computation**: Moved LCS diff computation up to `tool-client.tsx` and pass the pre-computed full diff lines as a prop to both `ToolCanvas` and `ToolSidebar`, eliminating duplicate O(m×n) computation on every text change.
- **Consolidated CSS import**: Moved `diff-viewer.css` import from 3 component files (`tool-canvas.tsx`, `tool-sidebar.tsx`, `tool-toolbar.tsx`) to a single import in `tool-client.tsx`, reducing bundle size and redundant style injection.
- **Removed unused `onViewModeChange` prop**: Cleaned up the `ToolSidebarProps` interface by removing the `onViewModeChange` handler which was never used by the sidebar.

- **Word-level diff highlighting**: Changed lines in unified and split views now show word-level changes with inline highlighting — added words highlighted in green, removed words highlighted in red, making it easy to see exactly what changed within a line.
- **Improved hunk markers**: Collapsed context sections in unified view now show proper hunk headers with line range info (e.g., `@@ -3,5 +3,5 @@`) instead of plain `...` markers.
- **Dual line number columns**: Unified and split diff views now show both old and new line numbers side-by-side for better orientation.
- **New DiffLine types**: `WordChange` and `DiffOp` interfaces added for word-level diff support.
- **Expanded test coverage**: Added `diff-computation.test.ts` with 15 new tests covering edge cases, context line filtering, word diff integration, and type compliance.
- **Refactored handleCopyDiff**: Replaced inline duplicated LCS algorithm with the shared `generateUnifiedDiffString` function from `tool-canvas.tsx`, reducing code duplication and ensuring consistent diff output.

### Documentation

- **README.md**: Added `Ctrl+Shift+Delete` as an alternative shortcut for clearing both panels, reflecting the handling in `tool-client.tsx`.

## [1.4.0] - 2026-05-23

### Changed

- Deployment from Vercel to Docker (self-hosted).

## [1.3.0] - 2026-05-22

### Added

- **useUrlState hook**: New hook in `@itsjust/core` that reads compressed state from URL query parameters on mount and provides `createShareUrl` for sharing via Web Share API or clipboard. Replaces inline URL state logic in tool-client.tsx with a reusable pattern.

### Fixed

- **Skip-nav link**: Added `id="main-content"` to the ToolShell container so the layout-level skip link (in `src/app/layout.tsx`) correctly targets the main content area.
- **Render-phase side effect**: `getStorageNamespace()` was reading and writing localStorage during render, violating React's pure render contract. Replaced with `useState` lazy initializer so storage side effects run only during component mount.
- **Sidebar focus restoration**: When the sidebar closes, focus now returns to the toggle button (`data-sidebar-toggle`) so screen reader users are not left without a focused element.
- **ExportEngine ref anti-pattern**: `useRef(createExportEngine(...))` replaced with `useMemo(...)` to avoid creating a new engine instance on every render pass.

### Changed

- Bumped `@itsjust/core` to 1.2.0.

## [1.2.12] - 2026-05-21

### Changed

- Bumped dependencies: lucide-react (1.16.0), react/react-dom (19.2.6), tailwindcss (4.3.0), @tailwindcss/postcss (4.3.0), jsdom (29.1.1), @playwright/test (1.60.0), vitest (4.1.6), @types/node (25.8.0), eslint-config-next (16.2.6)

## [1.2.11] - 2026-05-08

### Added

- Added **Design Principles** section covering HCD and general UI principles.
- Added **File Boundaries** section documenting read-only, editable, and conditionally editable files.
- Added mandatory reading notices to top of CLAUDE.md and in "Creating a New Tool" checklist.

### Changed

- Strengthened Agent Workflow Rules: proactive commit/push, version audit before every commit, and no co-author trailers.

## [1.2.10] - 2026-05-05

### Removed

- Removed the dedicated `/help` page, its CSS, and the Help shortcut group. Tool UX is designed to be self-explanatory.

## [1.2.9] - 2026-05-05

### Fixed

- Edited toolbar title now survives page reloads. `brandValue` was initialized once and never synced back to the stored `title` after async state hydration.
- Tab title (`document.title`) now reliably reflects the stored title via a dedicated `useEffect` that tracks `title` changes.

## [1.2.8] - 2026-05-05

### Changed

- Replaced all hand-coded SVG icon components with `lucide-react` icons for consistent, high-quality rendering across the toolbar (Undo, Redo, Settings, Sun, Moon).
- `@itsjust/core` now depends on `lucide-react@^0.471.0`.

### Fixed

- Toolbar brand text now correctly displays the edited title from `actions.brandValue` when not in editing mode, instead of always falling back to the static config name.

## [1.2.4] - 2026-05-05

### Added

- Toolbar brand name is now editable inline. Click the name to rename; Enter confirms, Escape cancels. The edited name persists in tool state and syncs to the browser tab title.

### Fixed

- Replaced the complex Settings icon SVG with a cleaner 6-spoke cog design that renders clearly at 16×16 px.

## [1.2.3] - 2026-05-05

### Changed

- Expanded unit test coverage for exporters: CORS error formatting, abort signal handling, sensitive data blocking, DOM/style restoration on failure, background color inlining, textarea scroll expansion, special character handling, and PDF iframe content verification.

## [1.2.0] - 2026-05-05

### Fixed

- Image export now preserves the actual theme background color instead of forcing white. Uses computed styles from the live element.
- Image export now captures the full scrolled textarea content by expanding clone height to `scrollHeight`.
- Fixed `html-to-image` font embedding crash (`skipFonts: true`) that caused exports to fail silently in production.
- Fixed blank exports caused by off-screen manual clone collapsing due to missing layout context.

### Changed

- PDF export now attempts DOM-based rendering first and only falls back to raster image embedding when needed.
- PDF export now adds a searchable text layer derived from canvas DOM text so text content can be indexed/copied in successful exports.
- Expanded export test coverage for screenshot downloads (PNG, JPEG, WEBP), PDF download flow, large-canvas image dimensions, and long multiline PDF text handling.

### Added

- **Notepad Tool**: Built a complete single-purpose notepad tool (`simple-notepad`).
  - Clean textarea-based canvas with monospace font and adjustable font size (8–72px).
  - Toolbar with font-size controls (A− / A+) and help link.
  - Sidebar showing live document stats: words, characters, characters without spaces, and lines.
  - Full export support: JSON, PNG, JPEG, WebP, PDF (all client-side via lazy-loaded exporters).
  - URL-based sharing with compressed state and automatic hydration on load.
  - Undo/redo, auto-save, dark mode, and high-contrast accessibility support.
  - Updated tests: 92 passing across unit and component suites.

## [1.1.0] - 2026-04-28

### Changed

- Layout now uses the full available canvas area instead of an A4-like centered width, with responsive spacing for desktop and mobile.
- Documentation updated to reflect the full-space responsive canvas behavior in `README.md`, `GUIDE.md`, and `CLAUDE.md`.
- Privacy-first defaults tightened: removed server-sharing env token guidance, added telemetry-disable default in `.env.example`, and added lint guards that block network calls in tool logic files.
- Added high-contrast accessibility support (manual toggle + system contrast preference handling) and improved status announcements with `aria-live`.
- Accessibility guidance now explicitly states that accessibility is mandatory across `README.md`, `GUIDE.md`, and `CLAUDE.md`.
- Import/Export now includes URL-based sharing with compressed state in query params and automatic state hydration when opening a shared link.
- AI/agent documentation was tightened with mandatory guardrails to enforce single-purpose scope, privacy-first defaults, and accessibility requirements.
- Reset now requires a confirmation dialog before clearing state, and reset actions remain undoable via the existing undo history.
- Added a dedicated `/help` page with inline-rendered SVG usage graphics, practical workflow examples, and direct sidebar navigation.
- Added a visible toolbar button to open the full keyboard shortcuts overlay so all shortcuts are always discoverable (in addition to `?`).
- Redesigned the help page layout and content for better usability, and moved help access from the sidebar into a visible header toolbar button.
- Tightened AI contribution rules to require explicit reporting of template-level bugs instead of silently mutating template baseline data/contracts.
- Updated shortcuts overlay trigger to require Ctrl/Cmd + ? instead of plain ?, preventing accidental popup while typing.

## [1.0.0] - 2026-04-24

### Added

- **Testing**: Comprehensive test suite with 48 tests across all core hooks and components.
  - `useExport` tests with race condition and error handling coverage.
  - `useShare` tests for download, web share, and clipboard.
  - `useStorage` tests with corrupted data handling.
  - `useTool` integration tests with ToastProvider wrapper.
  - `ThemeProvider` tests with `matchMedia` mock.
  - `ImportExport` component tests for dropdown and file input.
  - `ExportEngine` tests for Blob URL cleanup.
- **E2E**: Playwright now runs on Chromium, Firefox, WebKit, and mobile viewports (Pixel 5, iPhone 12).
- **CI/CD**: Security headers enabled in `next.config.ts` (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- **Accessibility**:
  - Focus trap in `KeyboardShortcutsOverlay`.
  - ARIA live region for toasts (`aria-live="polite"`).
  - Sidebar resize handle with `aria-valuenow/min/max` and keyboard control (ArrowLeft/Right).
  - Canvas marked with `role="application"` and `aria-label`.
- **Keyboard Navigation**: Export dropdown supports Home, End, PageUp, PageDown, and typeahead search.
- **Error Resilience**: `html2canvas` lazy-load failures handled with retry mechanism (3 attempts with exponential backoff).
- **Display Names**: All components and icon components have explicit `displayName` for React DevTools.

### Changed

- **API Breaking**: `Tool.deserialize` now returns `DeserializeResult<TState>` instead of `TState` directly.
  - Callers must check `result.success` before using `result.data`.
- **API Breaking**: `useImport` no longer uses generic `T`. Returns `ImportResult` with `data: unknown`.
  - Type safety enforced via `tool.deserialize` validation.
- **API Breaking**: `handleExport` now returns `Promise<{ success: boolean; error?: string }>`.
  - Callers can react to export failures.
- **File Size Display**: Dynamic units (B, KB, MB) instead of always showing MB with `toFixed(0)`.

### Fixed

- **Memory Leak**: `triggerDownload` now revokes Blob URLs for string exports too.
- **Race Condition**: `useExport.isExporting` uses a ref for atomic check before concurrent exports.
- **Export Format Mismatch**: `tool.config.ts` lists all registered formats.
- **Keyboard Shortcuts**: `useKeyboardShortcuts` deps fixed — listens to entire `actions` object.
- **Sidebar Callback Churn**: `toggleSidebar` uses `useRef` for current value instead of closure.
- **Focus Restoration**: `KeyboardShortcutsOverlay` checks `document.body.contains(prev)` before restoring focus.
- **Sidebar Resize**: Ref anti-pattern replaced with direct save in `mouseup` handler.

### Removed

- **Deprecated API**: `registerExporterLoader` and `registerToolExporters` removed.
- **Dead Component**: `tool-shell-export-dropdown.tsx` removed (unused, `ImportExport` component is used instead).
- **Duplicate `formatLabels`**: Centralized in `packages/core/src/types/export.ts`.
