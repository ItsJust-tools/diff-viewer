'use client';

import { useCallback, useMemo, useRef, useState, useEffect, useDeferredValue } from 'react';
import { ToolShell, useTool, ImportExport } from '@itsjust/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { DiffLine } from '@/tool';
import {
  toolConfig,
  templateBaseVersion,
  diffViewerTool,
  ToolCanvas,
  ToolToolbar,
  ToolSidebar,
  computeRawDiff,
  filterDiffLines,
  generateUnifiedDiffString,
} from '@/tool';
import '../tool/components/diff-viewer.css';

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

  // Use deferred values for large inputs to keep the UI responsive
  // while diff computation catches up
  const isLargeInput = data.original.length > 50_000 || data.modified.length > 50_000;
  const deferredOriginal = useDeferredValue(isLargeInput ? data.original : data.original);
  const deferredModified = useDeferredValue(isLargeInput ? data.modified : data.modified);
  const isDiffStale = isLargeInput && (deferredOriginal !== data.original || deferredModified !== data.modified);

  // Use deferred values for diff computation when input is large
  const diffOriginal = isLargeInput ? deferredOriginal : data.original;
  const diffModified = isLargeInput ? deferredModified : data.modified;

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

  // Compute raw (unfiltered) diff once — shared across canvas, sidebar, and stats
  // Using computeRawDiff avoids redundant LCS computation when deriving filtered views
  const rawDiffLines: DiffLine[] = useMemo(
    () =>
      diffOriginal || diffModified
        ? computeRawDiff(diffOriginal, diffModified, data.wordDiff)
        : [],
    [diffOriginal, diffModified, data.wordDiff]
  );

  // Derive the full (unfiltered) lines for side-by-side and split views
  // When contextLines is -1, filterDiffLines returns the raw diff as-is
  const fullDiffLines: DiffLine[] = useMemo(
    () => filterDiffLines(rawDiffLines, -1),
    [rawDiffLines]
  );

  // Pre-compute filtered diff lines for unified view to avoid redundant LCS in ToolCanvas
  const filteredDiffLines: DiffLine[] = useMemo(
    () =>
      data.viewMode === 'unified' && rawDiffLines.length > 0
        ? filterDiffLines(rawDiffLines, data.contextLines)
        : [],
    [rawDiffLines, data.viewMode, data.contextLines]
  );

  const diffStats = useMemo(() => {
    if (fullDiffLines.length === 0) return { additions: 0, deletions: 0 };
    let additions = 0;
    let deletions = 0;
    for (const line of fullDiffLines) {
      if (line.type === 'added') additions++;
      else if (line.type === 'removed') deletions++;
    }
    return { additions, deletions };
  }, [fullDiffLines]);

  const handleCopyDiff = useCallback(() => {
    const diff = generateUnifiedDiffString(data.original, data.modified, fullDiffLines);
    if (!diff) {
      showToast('Nothing to copy — paste text in both panels first', 'error');
      return;
    }
    navigator.clipboard.writeText(diff).then(
      () => showToast('Unified diff copied to clipboard', 'success'),
      () => showToast('Failed to copy to clipboard', 'error')
    );
  }, [data.original, data.modified, fullDiffLines, showToast]);

  const handleCopyJson = useCallback(() => {
    const json = JSON.stringify(
      {
        original: data.original,
        modified: data.modified,
        viewMode: data.viewMode,
        showWhitespace: data.showWhitespace,
        contextLines: data.contextLines,
        wordDiff: data.wordDiff,
        wrapLines: data.wrapLines,
      },
      null,
      2
    );
    navigator.clipboard.writeText(json).then(
      () => showToast('State copied as JSON to clipboard', 'success'),
      () => showToast('Failed to copy to clipboard', 'error')
    );
  }, [data, showToast]);

  // Keyboard shortcuts for Swap, Clear, and Export JSON
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        tool.handleExport('json');
        return;
      }

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
  }, [handleSwap, handleClear, tool]);

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

  const toolbarContent = (
    <>
      <ToolToolbar original={data.original} modified={data.modified} viewMode={data.viewMode} />
      {isDiffStale && (
        <span className="toolbar-large-warning" role="alert">
          Computing diff…
        </span>
      )}
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
      diffLines={fullDiffLines}
      diffStats={diffStats}
      onShowWhitespaceChange={handleShowWhitespaceChange}
      onWordDiffChange={handleWordDiffChange}
      onWrapLinesChange={handleWrapLinesChange}
      onContextLinesChange={handleContextLinesChange}
      onSwap={handleSwap}
      onClear={handleClear}
      onCopyDiff={handleCopyDiff}
      onCopyJson={handleCopyJson}
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
      diffLines={fullDiffLines}
      filteredDiffLines={filteredDiffLines}
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
