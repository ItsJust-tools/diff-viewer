# itsjust — Diff / Patch Viewer

[![Live](https://img.shields.io/badge/Live-itsjust.tools-8b5cf6?style=for-the-badge)](https://diff-viewer.itsjust.tools)

View and compare text differences side-by-side. Paste two versions of any text and see exactly what changed, added, or removed.

**Live at:** [diff-viewer.itsjust.tools](https://diff-viewer.itsjust.tools)

## Features

- **Three View Modes:** Side-by-side editor, unified diff output, and split view
- **Real-time Diff:** See changes as you type with color-coded additions and removals
- **Whitespace Visibility:** Toggle display of spaces and tabs
- **Context Control:** Adjust how many surrounding lines to show in unified view
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

## Tech Stack

- **Framework:** Next.js 16 with App Router
- **UI:** React 19 + TypeScript
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest + Playwright
- **Package Manager:** npm workspaces

## License

MIT
