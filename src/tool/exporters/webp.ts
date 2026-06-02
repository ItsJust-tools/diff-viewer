import type { Exporter } from '@itsjust/core';
import { createCanvasExporter } from './utils';

/**
 * WebP image exporter for the diff viewer tool.
 * Captures the visible tool area as a compressed WebP screenshot at 90% quality.
 * Used when the user selects "Export as WebP" from the export menu.
 */
const webpExporter: Exporter = createCanvasExporter('webp', 'image/webp', 'webp', 0.9);

export default webpExporter;
