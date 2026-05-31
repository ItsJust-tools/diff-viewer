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
    if (!data.original) {
      const lines = data.modified.split('\n');
      return { additions: lines.length, deletions: 0 };
    }
    if (!data.modified) {
      const lines = data.original.split('\n');
      return { additions: 0, deletions: lines.length };
    }

    const origLines = data.original.split('\n');
    const modLines = data.modified.split('\n');

    // Use a frequency-aware approach for accurate diff stats
    const origFreq = new Map<string, number>();
    for (const l of origLines) {
      origFreq.set(l, (origFreq.get(l) ?? 0) + 1);
    }

    const modFreq = new Map<string, number>();
    for (const l of modLines) {
      modFreq.set(l, (modFreq.get(l) ?? 0) + 1);
    }

    let additions = 0;
    let deletions = 0;

    for (const [line, count] of modFreq) {
      const origCount = origFreq.get(line) ?? 0;
      additions += Math.max(0, count - origCount);
    }

    for (const [line, count] of origFreq) {
      const modCount = modFreq.get(line) ?? 0;
      deletions += Math.max(0, count - modCount);
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
      contextLines={data.contextLines}
      onViewModeChange={handleViewModeChange}
      onShowWhitespaceChange={handleShowWhitespaceChange}
      onContextLinesChange={handleContextLinesChange}
      onSwap={handleSwap}
      onClear={handleClear}
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
      onOriginalChange={handleOriginalChange}
      onModifiedChange={handleModifiedChange}
      onViewModeChange={handleViewModeChange}
    />
  );

  const statusBarContent = (
    <>
      <span className={`status-slot status-slot-state ${tool.state.isDirty ? 'status-unsaved' : 'status-saved'}`}>
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
