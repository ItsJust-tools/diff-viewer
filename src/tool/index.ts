export { default as toolConfig } from './tool.config';
export { templateBaseVersion, toolVersion } from './tool.config';
export { templateMetadata, getPublicSiteUrl } from './template-metadata';
export { diffViewerTool } from './tool-definition';
export {
  ToolCanvas,
  computeDiff,
  computeRawDiff,
  filterDiffLines,
  generateUnifiedDiffString,
} from './components/tool-canvas';
export { ToolToolbar } from './components/tool-toolbar';
export { ToolSidebar } from './components/tool-sidebar';
export type { DiffViewerState, DiffLine } from './types';
