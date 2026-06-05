import type { ToolConfig } from '@itsjust/core';
import packageJson from '../../package.json';

export const templateBaseVersion = packageJson.version;

const toolConfig = {
  id: 'diff-viewer',
  name: 'Diff Viewer',
  description:
    'View and compare text differences side-by-side. Paste two versions of any text and see exactly what changed, added, or removed.',
  version: '1.7.0',
  exportFormats: ['json', 'png', 'jpeg', 'webp', 'pdf'],
  features: {
    export: true,
    autoSave: false,
    undoRedo: false,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#8b5cf6',
    accentHover: '#7c3aed',
    accentSubtle: 'rgba(139, 92, 246, 0.08)',
    brand: 'Diff Viewer',
    icon: '\u{2194}\u{FE0F}',
  },
  shortcuts: [
    {
      title: 'Diff Viewer',
      shortcuts: [
        {
          keys: 'Ctrl+Shift+E',
          label: 'Export JSON',
          description: 'export current diff as JSON',
        },
        {
          keys: 'Ctrl+Shift+P',
          label: 'Export PNG',
          description: 'screenshot as PNG',
        },
        {
          keys: 'Ctrl+1',
          label: 'Side-by-Side',
          description: 'switch to side-by-side view',
        },
        {
          keys: 'Ctrl+2',
          label: 'Unified',
          description: 'switch to unified view',
        },
        {
          keys: 'Ctrl+3',
          label: 'Split',
          description: 'switch to split view',
        },
        {
          keys: 'Ctrl+Shift+S',
          label: 'Swap',
          description: 'swap original and modified text',
        },
        {
          keys: 'Ctrl+Shift+Backspace',
          label: 'Clear',
          description: 'clear both text panels',
        },
        {
          keys: 'Ctrl+Shift+C',
          label: 'Copy Unified Diff',
          description: 'copy unified diff to clipboard',
        },
        {
          keys: 'Ctrl+Shift+J',
          label: 'Copy as JSON',
          description: 'copy viewer state as JSON to clipboard',
        },
      ],
    },
  ],
} satisfies ToolConfig;

export default toolConfig;
