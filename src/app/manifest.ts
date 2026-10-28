import type { MetadataRoute } from 'next';
import { templateMetadata } from '@/tool/template-metadata';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: templateMetadata.appName,
    short_name: templateMetadata.shortName,
    description: templateMetadata.appDescription,
    start_url: '/',
    display: 'standalone',
    background_color: templateMetadata.backgroundColor,
    theme_color: templateMetadata.themeColor,
    icons: [
      {
        src: templateMetadata.iconPath,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      ...templateMetadata.icons.any.map((icon) => ({ ...icon, purpose: 'any' as const })),
      ...templateMetadata.icons.maskable.map((icon) => ({ ...icon, purpose: 'maskable' as const })),
    ],
  };
}
