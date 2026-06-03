'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { ToolShell, useTool, ImportExport } from '@itsjust/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import {
  toolConfig,
  templateBaseVersion,
  diffViewerTool,
  ToolCanvas,
  ToolToolbar,
  ToolSidebar,
  computeDiff,
  generateUnifiedDiffString,
} from '@/tool';

const MAX_TEXT_LENGTH = 500_000; // character limit per textarea to prevent OOM

export default function ToolClient() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const tool = useTool(diffViewerTool, canvasRef);
  const data = tool.state.data;
  const setToolData = tool.state.setData;
  const showToast = tool.toast;
  const [isSharing, setIsSharing] = useState(false);
  const hasLoadedSharedState = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth > 768 && toolConfig.features.sidebar
  );

  const title = toolConfig.name;

  useEffect(() => {
    document.title = title;
  }, [title]);

  const handleOriginalChange = useCallback(
    (text: string) => {
      if (text.length > MAX_TEXT_LENGTH) {
        showToast(`Text too long — max ${MAX_TEXT_LENGTH.toLocaleString()} characters`, 'error');
        return;
      }
      setToolData((prev) => ({ ...prev, original: text }));
    },
    [setToolData, showToast]
  );

  const handleModifiedChange = useCallback(
    (text: string) => {
      if (text.length > MAX_TEXT_LENGTH) {
        showToast(`Text too long — max ${MAX_TEXT_LENGTH.toLocaleString()} characters`, 'error');
        return;
      }
      setToolData((prev) => ({ ...prev, modified: text }));
    },
    [setToolData, showToast]
  );

  const handleViewModeChange = useCallback(
    (viewMode: 'side-by-side' | 'unified' | 'split') => {
      setToolData((prev) => ({ ...prev, viewMode }));
    },
    [setToolData]
  );

  const handleShowWhitespaceChange = useCallback(
    (showWhitespace: boolean) => {
      setToolData((prev) => ({ ...prev, showWhitespace }));
    },
    [setToolData]
  );

  const handleWordDiffChange = useCallback(
    (wordDiff: boolean) => {
      setToolData((prev) => ({ ...prev, wordDiff }));
    },
    [setToolData]
  );

  const handleWrapLinesChange = useCallback(
    (wrapLines: boolean) => {
      setToolData((prev) => ({ ...prev, wrapLines }));
    },
    [setToolData]
  );

  const handleContextLinesChange = useCallback(
    (contextLines: number) => {
      setToolData((prev) => ({ ...prev, contextLines }));
    },
    [setToolData]
  );

  const handleSwap = useCallback(() => {
    setToolData((prev) => ({
      ...prev,
      original: prev.modified,
      modified: prev.original,
    }));
    showToast('Swapped original and modified', 'success');
  }, [setToolData, showToast]);

  const handleClear = useCallback(() => {
    setToolData((prev) => ({
      ...prev,
      original: '',
      modified: '',
    }));
    showToast('Cleared both panels', 'success');
  }, [setToolData, showToast]);

  const handleCopyDiff = useCallback(() => {
    const diff = generateUnifiedDiffString(data.original, data.modified);
    if (!diff) {
      showToast('Nothing to copy — paste text in both panels first', 'error');
      return;
    }
    navigator.clipboard.writeText(diff).then(
      () => showToast('Unified diff copied to clipboard', 'success'),
      () => showToast('Failed to copy to clipboard', 'error')
    );
  }, [data.original, data.modified, showToast]);

  // Keyboard shortcuts for Swap and Clear
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSwap();
        return;
      }

      if ((e.shiftKey && e.key === 'Backspace') || (e.shiftKey && e.key === 'Delete')) {
        e.preventDefault();
        handleClear();
        return;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSwap, handleClear]);

  useEffect(() => {
    if (hasLoadedSharedState.current) return;
    hasLoadedSharedState.current = true;
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get('state');
    if (!encodedState) return;
    try {
      const serialized = decompressFromEncodedURIComponent(encodedState);
      if (!serialized) throw new Error('Invalid shared URL');
      const parsed: unknown = JSON.parse(serialized);
      const deserialized = diffViewerTool.deserialize(parsed);
      if (!deserialized.success) throw new Error(deserialized.error);
      setToolData(deserialized.data);
      showToast('Loaded state from shared URL', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load shared URL';
      showToast(message, 'error');
    }
  }, [setToolData, showToast]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const serialized = diffViewerTool.serialize(tool.state.data);
      const encodedState = compressToEncodedURIComponent(serialized);
      if (!encodedState) throw new Error('Failed to encode state for URL');
      const url = new URL(window.location.href);
      url.searchParams.set('state', encodedState);
      url.searchParams.set('tool', toolConfig.id);
      window.history.replaceState(null, '', url.toString());

      const shareUrl = url.toString();
      if (navigator.share) {
        try {
          await navigator.share({ title, url: shareUrl });
          showToast('Shared URL ready', 'success');
          return;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(shareUrl);
      showToast('Share URL copied to clipboard', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share URL';
      showToast(message, 'error');
    } finally {
      setIsSharing(false);
    }
  }, [showToast, tool.state.data, title]);

  const diffStats = useMemo(() => {
    if (!data.original && !data.modified) return { additions: 0, deletions: 0 };
    // Use the same LCS-based algorithm as the diff view for accurate stats
    const lines = computeDiff(data.original, data.modified, -1);
    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
      if (line.type === 'added') additions++;
      else if (line.type === 'removed') deletions++;
    }
    return { additions, deletions };
  }, [data.original, data.modified]);

  const toolbarContent = (
    <>
      <ToolToolbar original={data.original} modified={data.modified} viewMode={data.viewMode} />
      <ImportExport
        formats={tool.supportedFormats}
        onExport={tool.handleExport}
        onImport={tool.importFromFile}
        isImporting={tool.isImporting}
        onShare={handleShare}
        isSharing={isSharing}
      />
    </>
  );

  const sidebarContent = (
    <ToolSidebar
      original={data.original}
      modified={data.modified}
      viewMode={data.viewMode}
      showWhitespace={data.showWhitespace}
      wordDiff={data.wordDiff}
      wrapLines={data.wrapLines}
      contextLines={data.contextLines}
      onViewModeChange={handleViewModeChange}
      onShowWhitespaceChange={handleShowWhitespaceChange}
      onWordDiffChange={handleWordDiffChange}
      onWrapLinesChange={handleWrapLinesChange}
      onContextLinesChange={handleContextLinesChange}
      onSwap={handleSwap}
      onClear={handleClear}
      onCopyDiff={handleCopyDiff}
    />
  );

  const canvasContent = (
    <ToolCanvas
      canvasRef={canvasRef}
      original={data.original}
      modified={data.modified}
      viewMode={data.viewMode}
      showWhitespace={data.showWhitespace}
      contextLines={data.contextLines}
      wordDiff={data.wordDiff}
      wrapLines={data.wrapLines}
      onOriginalChange={handleOriginalChange}
      onModifiedChange={handleModifiedChange}
      onViewModeChange={handleViewModeChange}
    />
  );

  const statusBarContent = (
    <>
      <span
        className={`status-slot status-slot-state ${tool.state.isDirty ? 'status-unsaved' : 'status-saved'}`}
      >
        {tool.state.isDirty ? (
          <>
            <span className="status-saving-dot" />
            Unsaved
          </>
        ) : tool.state.lastSaved ? (
          <>Saved {tool.state.lastSaved}</>
        ) : (
          'Ready'
        )}
      </span>
      <span className="status-slot status-slot-diff-stats">
        +{diffStats.additions} / -{diffStats.deletions}
      </span>
      <span className="status-slot status-slot-tool-version">Tool v{toolConfig.version}</span>
      <span className="status-slot status-slot-template-version">
        Template v{templateBaseVersion}
      </span>
    </>
  );

  return (
    <ToolShell
      config={toolConfig}
      actions={tool.toolbarActions}
      sidebarOpen={sidebarOpen}
      onSidebarChange={setSidebarOpen}
      toolbar={toolbarContent}
      sidebar={sidebarContent}
      canvas={canvasContent}
      statusBar={statusBarContent}
    />
  );
}
