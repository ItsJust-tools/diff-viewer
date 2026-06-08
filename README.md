# itsjust — Diff / Patch Viewer

[![Live](https://img.shields.io/badge/Live-diff--viewer.itsjust.tools-8b5cf6?style=for-the-badge)](https://diff-viewer.itsjust.tools)
[![CI](https://github.com/ItsJust-tools/diff-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/ItsJust-tools/diff-viewer/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm workspaces](https://img.shields.io/badge/monorepo-npm_workspaces-blue)](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
[![Next.js](https://img.shields.io/badge/Next.js_16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

View and compare text differences side-by-side. Paste two versions of any text and see exactly what changed, added, or removed.

**Live at:** [diff-viewer.itsjust.tools](https://diff-viewer.itsjust.tools)

## Features

- **Three View Modes:**
  - **Side-by-Side:** Two independent textarea panels (original / modified) — ideal for simultaneous editing and comparison
  - **Unified:** Compact interleaved diff output with color-coded additions and removals, context line control, and hunk headers
  - **Split:** Editor panel on the left + live unified diff output on the right — best of both worlds for iterative editing
- **Real-time Diff:** See changes as you type with color-coded additions and removals
- **Word-level Diff Highlighting:** Within each changed line, added/removed words are highlighted separately for precise comparison
- **Line Wrapping:** Toggle wrapping for long lines — avoids horizontal scrolling
- **Whitespace Visibility:** Toggle display of spaces (·) and tabs (→)
- **Ignore Whitespace:** Toggle to ignore whitespace-only changes in the diff — useful for comparing code where formatting/indentation differences don't matter
- **Context Control:** Adjust how many surrounding lines to show in unified view (0–20)
- **Swap & Clear:** One-click swap original ↔ modified or clear both panels
- **Copy Unified Diff:** Copy the complete unified diff to clipboard for sharing in code reviews or patches
- **Copy State as JSON:** Copy full viewer state (both texts + all settings) as JSON for programmatic use
- **Real-time Stats:** Line counts and character counts update live for both panels, along with addition/deletion tallies
- **Shareable URLs:** Share your diff via compressed state in the URL — share a link that restores both texts and view settings on open
- **Export:** Export as JSON, PNG, JPEG, WebP, or PDF

## Quick Start

```bash
git clone https://github.com/ItsJust-tools/diff-viewer.git
cd diff-viewer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start comparing.

## Scripts

| Script                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start development server with Turbopack  |
| `npm run build`        | Build `@itsjust/core` then build Next.js |
| `npm run start`        | Start production server                  |
| `npm run lint`         | Run ESLint                               |
| `npm run format`       | Format all files with Prettier           |
| `npm run format:check` | Check formatting without writing         |
| `npm run test`         | Run unit tests (Vitest)                  |
| `npm run test:watch`   | Run unit tests in watch mode             |
| `npm run test:e2e`     | Run end-to-end tests (Playwright)        |
| `npm run test:e2e:dev` | Run E2E tests with Playwright UI         |
| `npm run deps:check`   | Check for unused/missing dependencies    |

## Keyboard Shortcuts

| Shortcut                                      | Action                          |
| --------------------------------------------- | ------------------------------- |
| `Ctrl+1`                                      | Switch to Side-by-Side view     |
| `Ctrl+2`                                      | Switch to Unified view          |
| `Ctrl+3`                                      | Switch to Split view            |
| `Ctrl+Shift+E`                                | Export as JSON                  |
| `Ctrl+Shift+P`                                | Export as PNG                   |
| `Ctrl+Shift+J`                                | Export as JPEG                  |
| `Ctrl+Shift+W`                                | Export as WebP                  |
| `Ctrl+Shift+D`                                | Export as PDF                   |
| `Ctrl+Shift+S`                                | Swap original ↔ modified        |
| `Ctrl+Shift+Backspace`<br>`Ctrl+Shift+Delete` | Clear both text panels          |
| `Ctrl+Shift+C`                                | Copy Unified Diff to clipboard  |
| `Ctrl+Shift+Y`                                | Copy state as JSON to clipboard |

## Project Structure

```
diff-viewer/
├── packages/core/          # Shared @itsjust/core component library
├── src/
│   ├── app/               # Next.js App Router (pages, layout, SEO)
│   │   ├── page.tsx       # Tool entry point
│   │   ├── tool-client.tsx # Client-side state & event wiring
│   │   ├── layout.tsx     # Root layout
│   │   ├── globals.css    # Theme variables & global styles
│   │   ├── error.tsx      # Error boundary
│   │   ├── not-found.tsx  # 404 page
│   │   ├── json-ld.tsx    # Structured data
│   │   ├── manifest.ts    # PWA manifest
│   │   └── seo helpers    # robots.ts, sitemap.ts, etc.
│   └── tool/              # Diff viewer tool implementation
│       ├── components/    # ToolCanvas, ToolSidebar, ToolToolbar
│       ├── exporters/     # PNG, JPEG, WebP, PDF export
│       ├── types.ts       # DiffViewerState, DiffLine types
│       ├── tool.config.ts # Tool configuration & shortcuts
│       └── tool-definition.ts # Tool<T> contract (serialize, deserialize)
├── __tests__/             # Unit & E2E tests
│   ├── unit/              # Vitest unit tests
│   └── e2e/               # Playwright E2E tests
```

## Architecture

The diff viewer follows a clean layered architecture:

1. **Tool Definition** (`tool-definition.ts`) declares the typed state shape, serialization logic, and lazy-loaded exporters
2. **State Wiring** (`tool-client.tsx`) composes state, event handlers, and UI components via `useTool()` from `@itsjust/core`
3. **Presentation** (`components/`) renders the canvas (diff output), sidebar (stats & options), and toolbar (context info)
4. **Export** (`exporters/`) renders the canvas element to image formats via `html-to-image` or prints to PDF

See [ARCHITECTURE.md](ARCHITECTURE.md) for full details.

## Tech Stack

- **Framework:** Next.js 16 with App Router
- **UI:** React 19 + TypeScript
- **Styling:** Tailwind CSS v4
- **Diff Algorithm:** LCS (Longest Common Subsequence) with fallback for large inputs
- **Testing:** Vitest + Playwright
- **Package Manager:** npm workspaces

## Algorithm

The diff viewer uses the **Longest Common Subsequence (LCS)** algorithm to compute line-level diffs, with optimizations for performance and memory.

### Line-level Diff

1. Both texts are split into lines (`\n`-delimited).
2. An LCS dynamic programming table is built to find the longest sequence of unchanged lines.
3. The table is stored in a **single flat `Uint32Array`** (~4 bytes per cell), which is ~8× more memory-efficient than a conventional 2D `number[][]` array. This allows handling up to ~4,472 × ~4,472 = 20M cells (~80 MB) before falling back.
4. Backtracking through the DP table yields a sequence of `DiffOp` entries (`added`, `removed`, `unchanged`), which are then resolved into `DiffLine` objects with correct line numbers.

### Large Input Fallback

When the input exceeds ~20M cells (approximately 4,500 lines × 4,500 lines), the diff switches to a **chunked algorithm** that processes the input in fixed-size chunks (2,000 lines each). This avoids out-of-memory conditions while still producing substantially better diffs than a naive per-chunk comparison. Each chunk is analyzed independently with the full LCS algorithm, and results are stitched together.

### Word-level Diff

For each pair of changed lines (a removed line followed by an added line), a **second LCS pass** is performed at the token level. Lines are split into tokens using a regex that separates words (`\w+`) from whitespace runs (`\s+`). This highlights exactly which words were added or removed within each line. A soft guard prevents word-diff computation when token counts exceed 10,000 (unusual for a single line).

### Performance Considerations

- **Identical text fast path:** When `original === modified`, the LCS is skipped entirely — the diff is trivial.
- **Single-source shortcuts:** When one side is empty, the diff is computed in O(n) without the DP table.
- **Memoized computation:** Full LCS is computed once and cached; filtered views (with different context line settings) reuse the same raw result.
- **Deferred values:** For inputs >50K characters, React's `useDeferredValue` ensures the UI stays responsive while the diff computation runs.
- **Disableable word diff:** The `wordDiff` option controls whether the second LCS pass runs. Disabling it eliminates tokenization and a quadratic pass on every changed line, offering a smooth experience for very large diffs.

### Limitations

- The LCS algorithm has O(m×n) time complexity. Very large diffs (>10,000 lines) may take several seconds to compute.
- Word-level diff only applies to Latin-script and whitespace-delimited texts. CJK or other non-space-delimited languages will show full-line changes without word-level highlights.
- Character-level diff (showing inline character changes) is not currently supported.

## License

MIT
