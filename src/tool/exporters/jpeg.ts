import type { Exporter } from '@itsjust/core';
import { createCanvasExporter } from './utils';

/**
 * JPEG image exporter for the diff viewer tool.
 * Captures the visible tool area as a compressed JPEG screenshot at 92% quality.
 * Used when the user selects "Export as JPEG" from the export menu.
 */
const jpegExporter: Exporter = createCanvasExporter('jpeg', 'image/jpeg', 'jpg', 0.92);

export default jpegExporter;
