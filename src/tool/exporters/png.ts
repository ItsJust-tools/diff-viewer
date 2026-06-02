import type { Exporter } from '@itsjust/core';
import { createCanvasExporter } from './utils';

/**
 * PNG image exporter for the diff viewer tool.
 * Captures the visible tool area as a high-resolution (2×) PNG screenshot.
 * Used when the user selects "Export as PNG" from the export menu.
 */
const pngExporter: Exporter = createCanvasExporter('png', 'image/png', 'png');

export default pngExporter;
