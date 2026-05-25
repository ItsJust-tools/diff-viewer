# Architecture

## Core Layers

- `src/app`: Next.js routes, metadata, and runtime wiring.
- `src/tool`: Tool-specific state shape, serializers, UI, and exporters.
- `packages/core`: Shared shell, hooks, engines, and public APIs.

## Data Flow

1. `src/tool/tool-definition.ts` defines `Tool<TState>`.
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
