'use client';

import { useCallback, useMemo, useRef, useState, useEffect, useDeferredValue } from 'react';
import { ToolShell, useTool, ImportExport } from '@itsjust/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { DiffLine } from '@/tool';
import {
  toolConfig,
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
  const deferredOriginal = useDeferredValue(data.original);
  const deferredModified = useDeferredValue(data.modified);
  const isDiffStale =
    isLargeInput && (deferredOriginal !== data.original || deferredModified !== data.modified);

  // Use deferred values for diff computation when input is large
  const diffOriginal = isLargeInput ? deferredOriginal : data.original;
  const diffModified = isLargeInput ? deferredModified : data.modified;

  useEffect(() => {
    document.title = title;
  }, [title]);

  const handleOriginalChange = useCallback(
    (text: string) => {
      const excess = text.length - MAX_TEXT_LENGTH;
      const prefix = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
      if (text.length > MAX_TEXT_LENGTH) {
        showToast(`Truncated: ${prefix.length.toLocaleString()} chars kept, ${excess.toLocaleString()} discarded`, 'error');
      }
      setToolData((prev) => ({ ...prev, original: prefix }));
    },
    [setToolData, showToast]
  );

  const handleModifiedChange = useCallback(
    (text: string) => {
      const excess = text.length - MAX_TEXT_LENGTH;
      const prefix = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
      if (text.length > MAX_TEXT_LENGTH) {
        showToast(`Truncated: ${prefix.length.toLocaleString()} chars kept, ${excess.toLocaleString()} discarded`, 'error');
      }
      setToolData((prev) => ({ ...prev, modified: prefix }));
    },
    [setToolData, showToast]
  );

  const handleViewModeChange = useCallback(
    (viewMode: 'side-by-side' | 'unified' | 'split') => {
      setToolData((prev) => ({ ...prev, viewMode }));
      showToast(`Switched to ${viewMode === 'side-by-side' ? 'Side-by-Side' : viewMode === 'unified' ? 'Unified' : 'Split'} view`, 'success');
    },
    [setToolData, showToast]
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

  const handleIgnoreWhitespaceChange = useCallback(
    (ignoreWhitespace: boolean) => {
      setToolData((prev) => ({ ...prev, ignoreWhitespace }));
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
        ? computeRawDiff(diffOriginal, diffModified, data.wordDiff, data.ignoreWhitespace)
        : [],
    [diffOriginal, diffModified, data.wordDiff, data.ignoreWhitespace]
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
    if (rawDiffLines.length === 0) return { additions: 0, deletions: 0, changes: 0 };
    let additions = 0;
    let deletions = 0;
    for (const line of rawDiffLines) {
      if (line.type === 'added') additions++;
      else if (line.type === 'removed') deletions++;
    }
    return { additions, deletions, changes: additions + deletions };
  }, [rawDiffLines]);

  const handleCopyDiff = useCallback(() => {
    const diff = generateUnifiedDiffString(data.original, data.modified, rawDiffLines, data.contextLines, data.ignoreWhitespace);
    if (!diff) {
      showToast('Nothing to copy — paste text in both panels first', 'error');
      return;
    }
    navigator.clipboard.writeText(diff).then(
      () => showToast('Unified diff copied to clipboard', 'success'),
      () => showToast('Failed to copy to clipboard', 'error')
    );
  }, [data.original, data.modified, rawDiffLines, showToast, data.ignoreWhitespace, data.contextLines]);

  const handleCopyOriginal = useCallback(() => {
    if (!data.original) {
      showToast('Nothing to copy — original text is empty', 'error');
      return;
    }
    navigator.clipboard.writeText(data.original).then(
      () => showToast('Original text copied to clipboard', 'success'),
      () => showToast('Failed to copy to clipboard', 'error')
    );
  }, [data.original, showToast]);

  const handleCopyModified = useCallback(() => {
    if (!data.modified) {
      showToast('Nothing to copy — modified text is empty', 'error');
      return;
    }
    navigator.clipboard.writeText(data.modified).then(
      () => showToast('Modified text copied to clipboard', 'success'),
      () => showToast('Failed to copy to clipboard', 'error')
    );
  }, [data.modified, showToast]);

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
        ignoreWhitespace: data.ignoreWhitespace,
      },
      null,
      2
    );
    navigator.clipboard.writeText(json).then(
      () => showToast('State copied as JSON to clipboard', 'success'),
      () => showToast('Failed to copy to clipboard', 'error')
    );
  }, [data, showToast]);

  // Keyboard shortcuts for Swap, Clear, Copy Diff, Export JSON, and view mode switching
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Export shortcuts: Ctrl+Shift+E (JSON), Ctrl+Shift+P (PNG),
      // Ctrl+Shift+J (JPEG), Ctrl+Shift+W (WebP), Ctrl+Shift+D (PDF)
      if (e.shiftKey) {
        const exportKeyMap: Record<string, 'json' | 'png' | 'jpeg' | 'webp' | 'pdf'> = {
          e: 'json',
          E: 'json',
          p: 'png',
          P: 'png',
          j: 'jpeg',
          J: 'jpeg',
          w: 'webp',
          W: 'webp',
          d: 'pdf',
          D: 'pdf',
        };
        const fmt = exportKeyMap[e.key];
        if (fmt) {
          e.preventDefault();
          tool.handleExport(fmt);
          return;
        }
      }

      if (e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSwap();
        return;
      }

      if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCopyDiff();
        return;
      }

      if (e.shiftKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleCopyJson();
        return;
      }

      if ((e.shiftKey && e.key === 'Backspace') || (e.shiftKey && e.key === 'Delete')) {
        e.preventDefault();
        handleClear();
        return;
      }

      // View mode switching: Ctrl+1 (side-by-side), Ctrl+2 (unified), Ctrl+3 (split)
      if (!e.shiftKey && !e.altKey) {
        const modeMap: Record<string, 'side-by-side' | 'unified' | 'split'> = {
          '1': 'side-by-side',
          '2': 'unified',
          '3': 'split',
        };
        const mode = modeMap[e.key];
        if (mode && mode !== data.viewMode) {
          e.preventDefault();
          handleViewModeChange(mode);
          return;
        }

        // Toggle options: Ctrl+W (wrap lines), Ctrl+Shift+W is export WebP
        if (e.key === 'w' && !e.shiftKey) {
          e.preventDefault();
          handleWrapLinesChange(!data.wrapLines);
          showToast(`Line wrapping ${data.wrapLines ? 'disabled' : 'enabled'}`, 'success');
          return;
        }

        // Ctrl+. (period) to toggle showWhitespace
        if (e.key === '.') {
          e.preventDefault();
          handleShowWhitespaceChange(!data.showWhitespace);
          showToast(
            `Whitespace visualization ${data.showWhitespace ? 'disabled' : 'enabled'}`,
            'success'
          );
          return;
        }

        // Ctrl+, (comma) to toggle word diff
        if (e.key === ',') {
          e.preventDefault();
          handleWordDiffChange(!data.wordDiff);
          showToast(`Word-level diff ${data.wordDiff ? 'disabled' : 'enabled'}`, 'success');
          return;
        }

        // Ctrl+I to toggle ignore whitespace
        if (e.key === 'i') {
          e.preventDefault();
          handleIgnoreWhitespaceChange(!data.ignoreWhitespace);
          showToast(
            `Ignore whitespace ${data.ignoreWhitespace ? 'disabled' : 'enabled'}`,
            'success'
          );
          return;
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    handleSwap,
    handleClear,
    handleCopyDiff,
    handleCopyJson,
    handleViewModeChange,
    handleWrapLinesChange,
    handleShowWhitespaceChange,
    handleWordDiffChange,
    handleIgnoreWhitespaceChange,
    showToast,
    tool,
    data.viewMode,
    data.wrapLines,
    data.showWhitespace,
    data.wordDiff,
    data.ignoreWhitespace,
  ]);

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
      <ToolToolbar
        original={data.original}
        modified={data.modified}
        viewMode={data.viewMode}
        additions={diffStats.additions}
        deletions={diffStats.deletions}
        wordDiff={data.wordDiff}
        showWhitespace={data.showWhitespace}
        wrapLines={data.wrapLines}
        ignoreWhitespace={data.ignoreWhitespace}
      />
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
      ignoreWhitespace={data.ignoreWhitespace}
      diffLines={rawDiffLines}
      diffStats={diffStats}
      onShowWhitespaceChange={handleShowWhitespaceChange}
      onWordDiffChange={handleWordDiffChange}
      onWrapLinesChange={handleWrapLinesChange}
      onContextLinesChange={handleContextLinesChange}
      onIgnoreWhitespaceChange={handleIgnoreWhitespaceChange}
      onSwap={handleSwap}
      onClear={handleClear}
      onCopyDiff={handleCopyDiff}
      onCopyJson={handleCopyJson}
      onCopyOriginal={handleCopyOriginal}
      onCopyModified={handleCopyModified}
    />
  );

  const canvasContent = (
    <ToolCanvas
      isDiffStale={isDiffStale}
      canvasRef={canvasRef}
      original={data.original}
      modified={data.modified}
      viewMode={data.viewMode}
      showWhitespace={data.showWhitespace}
      contextLines={data.contextLines}
      wordDiff={data.wordDiff}
      wrapLines={data.wrapLines}
      diffLines={rawDiffLines}
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
