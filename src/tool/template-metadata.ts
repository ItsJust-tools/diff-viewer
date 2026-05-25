import toolConfig from './tool.config';

const DEFAULT_DEV_URL = 'http://localhost:3000';

export const templateMetadata = {
  htmlLang: 'en',
  locale: 'en_US',
  appName: toolConfig.name,
  shortName: toolConfig.name,
  appDescription: toolConfig.description,
  iconPath: '/icon.svg',
};

export function getPublicSiteUrl(): string {
  return process.env.NEXT_PUBLIC_URL || DEFAULT_DEV_URL;
}
