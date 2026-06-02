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

  const handleCopyDiff = useCallback(() => {
    const generateUnifiedDiff = (original: string, modified: string): string => {
      const origLines = original.split('\n');
      const modLines = modified.split('\n');

      if (!original && !modified) return '';
      if (!original) {
        return modLines.map((line) => `+${line}`).join('\n');
      }
      if (!modified) {
        return origLines.map((line) => `-${line}`).join('\n');
      }

      const m = origLines.length;
      const n = modLines.length;

      // Fallback for large input
      if (m * n > 10_000_000) {
        const lines: string[] = [];
        lines.push(`--- original`);
        lines.push(`+++ modified`);
        lines.push(`@@ -1,${m} +1,${n} @@`);
        const maxLen = Math.max(m, n);
        for (let i = 0; i < maxLen; i++) {
          const ol = i < m ? (origLines[i] ?? null) : null;
          const ml = i < n ? (modLines[i] ?? null) : null;
          if (ol === null && ml !== null) lines.push(`+${ml}`);
          else if (ol !== null && ml === null) lines.push(`-${ol}`);
          else if (ol !== null && ml !== null && ol === ml) lines.push(` ${ol}`);
          else if (ol !== null && ml !== null) {
            lines.push(`-${ol}`);
            lines.push(`+${ml}`);
          }
        }
        return lines.join('\n');
      }

      // LCS DP table
      const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (origLines[i - 1] === modLines[j - 1]) {
            dp[i]![j] = (dp[i - 1]![j - 1] as number) + 1;
          } else {
            dp[i]![j] = Math.max(dp[i - 1]![j] as number, dp[i]![j - 1] as number);
          }
        }
      }

      // Backtrack
      const result: string[] = [];
      result.push(`--- original`);
      result.push(`+++ modified`);
      result.push(`@@ -1,${m} +1,${n} @@`);

      let i = m;
      let j = n;
      const stack: string[] = [];
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
          stack.push(` ${origLines[i - 1] as string}`);
          i--;
          j--;
        } else if (j > 0 && (i === 0 || (dp[i]![j - 1] as number) >= (dp[i - 1]![j] as number))) {
          stack.push(`+${modLines[j - 1] as string}`);
          j--;
        } else if (i > 0) {
          stack.push(`-${origLines[i - 1] as string}`);
          i--;
        }
      }

      result.push(...stack.reverse());
      return result.join('\n');
    };

    const diff = generateUnifiedDiff(data.original, data.modified);
    if (!diff) {
      showToast('Nothing to copy — paste text in both panels first', 'error');
      return;
    }
    navigator.clipboard.writeText(diff).then(
      () => showToast('Unified diff copied to clipboard', 'success'),
      () => showToast('Failed to copy to clipboard', 'error'),
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
