#!/usr/bin/env node
/**
 * Rasters the PWA icons in `public/` from their SVG sources.
 *
 * Run with: npm run icons:generate
 *
 * Sources of truth:
 * - `public/icon.svg`           regular "any" artwork (rounded square)
 * - `public/icon-maskable.svg`  maskable artwork (full-bleed, padded glyph)
 *
 * Outputs (committed so the build never depends on this script):
 * - `public/icon-{192,512}.png`
 * - `public/icon-maskable-{192,512}.png`
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(projectRoot, 'public');

const SIZES = [192, 512];
const TARGETS = [
  { source: 'icon.svg', output: (size) => `icon-${size}.png` },
  { source: 'icon-maskable.svg', output: (size) => `icon-maskable-${size}.png` },
];

const written = [];
for (const { source, output } of TARGETS) {
  const svg = await readFile(join(publicDir, source));
  for (const size of SIZES) {
    const png = await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const file = output(size);
    await writeFile(join(publicDir, file), png);
    written.push(`public/${file} (${png.length} bytes)`);
  }
}

for (const line of written) console.log(`generated ${line}`);
