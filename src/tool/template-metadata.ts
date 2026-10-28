import toolConfig from './tool.config';

const DEFAULT_DEV_URL = 'http://localhost:3000';

export const templateMetadata = {
  htmlLang: 'en',
  locale: 'en_US',
  appName: toolConfig.name,
  shortName: toolConfig.name,
  appDescription: toolConfig.description,
  iconPath: '/icon.svg',
  /**
   * Raster icons referenced by the PWA manifest. `any` icons keep the rounded
   * artwork of `icon.svg`; `maskable` icons are full-bleed with the glyph inside
   * the safe zone, so launchers can crop them to any mask shape.
   */
  icons: {
    any: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    maskable: [
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  themeColor: '#111827',
  backgroundColor: '#111827',
};

export function getPublicSiteUrl(): string {
  return process.env.NEXT_PUBLIC_URL || DEFAULT_DEV_URL;
}
