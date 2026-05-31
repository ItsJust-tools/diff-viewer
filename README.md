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

- **Three View Modes:** Side-by-side editor, unified diff output, and split (editor + diff) view
- **Real-time Diff:** See changes as you type with color-coded additions and removals
- **Whitespace Visibility:** Toggle display of spaces (·) and tabs (→)
- **Context Control:** Adjust how many surrounding lines to show in unified view (0–20)
- **Swap & Clear:** One-click swap original ↔ modified or clear both panels
- **Shareable URLs:** Share your diff via compressed state in the URL
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

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Build `@itsjust/core` then build Next.js |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |
| `npm run test:e2e:dev` | Run E2E tests with Playwright UI |
| `npm run deps:check` | Check for unused/missing dependencies |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Switch to Side-by-Side view |
| `Ctrl+2` | Switch to Unified view |
| `Ctrl+3` | Switch to Split view |
| `Ctrl+Shift+E` | Export as JSON |
| `Ctrl+Shift+P` | Export as PNG |

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

## License

MIT
