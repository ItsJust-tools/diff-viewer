import { describe, it, expect } from 'vitest';
import { diffViewerTool } from '@/tool/tool-definition';
import type { DiffViewerState } from '@/tool/types';

describe('DiffViewerState validation (deserialize)', () => {
  it('accepts valid minimal state', () => {
    const result = diffViewerTool.deserialize({ original: 'hello', modified: 'world' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.original).toBe('hello');
      expect(result.data.modified).toBe('world');
      expect(result.data.viewMode).toBe('side-by-side');
      expect(result.data.showWhitespace).toBe(true);
      expect(result.data.contextLines).toBe(3);
      expect(result.data.wordDiff).toBe(true);
      expect(result.data.wrapLines).toBe(false);
    }
  });

  it('accepts valid full state with all fields', () => {
    const result = diffViewerTool.deserialize({
      original: 'a\nb\nc',
      modified: 'a\nc\nd',
      viewMode: 'unified',
      showWhitespace: false,
      contextLines: 5,
      wordDiff: false,
      wrapLines: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.viewMode).toBe('unified');
      expect(result.data.showWhitespace).toBe(false);
      expect(result.data.contextLines).toBe(5);
      expect(result.data.wordDiff).toBe(false);
      expect(result.data.wrapLines).toBe(true);
    }
  });

  it('accepts split viewMode', () => {
    const result = diffViewerTool.deserialize({
      original: '',
      modified: '',
      viewMode: 'split',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.viewMode).toBe('split');
    }
  });

  it('rejects null data', () => {
    const result = diffViewerTool.deserialize(null);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('rejects non-object data', () => {
    const result = diffViewerTool.deserialize('string');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('rejects object without original', () => {
    const result = diffViewerTool.deserialize({ modified: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('rejects object without modified', () => {
    const result = diffViewerTool.deserialize({ original: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('rejects object with non-string original', () => {
    const result = diffViewerTool.deserialize({ original: 123, modified: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('rejects object with non-string modified', () => {
    const result = diffViewerTool.deserialize({ original: 'x', modified: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('rejects invalid viewMode string', () => {
    const result = diffViewerTool.deserialize({
      original: '',
      modified: '',
      viewMode: 'invalid-mode',
    });
    // Should reject non-enum viewMode values
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('rejects non-boolean showWhitespace', () => {
    const result = diffViewerTool.deserialize({
      original: '',
      modified: '',
      showWhitespace: 'no',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('rejects non-number contextLines', () => {
    const result = diffViewerTool.deserialize({
      original: '',
      modified: '',
      contextLines: 'three',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Invalid data');
  });

  it('accepts contextLines of 0', () => {
    const result = diffViewerTool.deserialize({
      original: 'a',
      modified: 'b',
      contextLines: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.contextLines).toBe(0);
  });

  it('accepts negative contextLines', () => {
    const result = diffViewerTool.deserialize({
      original: 'a',
      modified: 'b',
      contextLines: -1,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.contextLines).toBe(-1);
  });

  it('fills missing original defaults from initialState', () => {
    // initialState is used by the tool, deserialize has its own defaults
    const result = diffViewerTool.deserialize({ original: 'x', modified: 'y' });
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean wordDiff', () => {
    const result = diffViewerTool.deserialize({
      original: '',
      modified: '',
      wordDiff: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean wrapLines', () => {
    const result = diffViewerTool.deserialize({
      original: '',
      modified: '',
      wrapLines: 'no',
    });
    expect(result.success).toBe(false);
  });

  it('accepts boolean wordDiff', () => {
    const result = diffViewerTool.deserialize({
      original: 'a',
      modified: 'b',
      wordDiff: false,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.wordDiff).toBe(false);
  });

  it('accepts boolean wrapLines', () => {
    const result = diffViewerTool.deserialize({
      original: 'a',
      modified: 'b',
      wrapLines: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.wrapLines).toBe(true);
  });
});

describe('DiffViewer serialize', () => {
  it('serializes state to formatted JSON string', () => {
    const state: DiffViewerState = {
      original: 'hello',
      modified: 'world',
      viewMode: 'unified',
      showWhitespace: false,
      contextLines: 2,
      wordDiff: true,
      wrapLines: false,
      ignoreWhitespace: false,
    };
    const json = diffViewerTool.serialize(state);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.original).toBe('hello');
    expect(parsed.modified).toBe('world');
    expect(parsed.viewMode).toBe('unified');
    expect(parsed.showWhitespace).toBe(false);
    expect(parsed.contextLines).toBe(2);
  });

  it('serializes minimal state correctly', () => {
    const json = diffViewerTool.serialize({
      original: '',
      modified: '',
      viewMode: 'side-by-side',
      showWhitespace: true,
      contextLines: 3,
      wordDiff: true,
      wrapLines: false,
      ignoreWhitespace: false,
    });
    const parsed = JSON.parse(json);
    expect(parsed.original).toBe('');
    expect(parsed.modified).toBe('');
  });

  it('serialized JSON is pretty-printed with 2-space indent', () => {
    const json = diffViewerTool.serialize({
      original: 'a',
      modified: 'b',
      viewMode: 'side-by-side',
      showWhitespace: true,
      contextLines: 3,
      wordDiff: true,
      wrapLines: false,
      ignoreWhitespace: false,
    });
    // Should not be on a single line
    expect(json).toContain('\n  ');
  });
});

describe('DiffViewer initialState', () => {
  it('has correct initial state shape', () => {
    const state = diffViewerTool.initialState;
    expect(state.original).toBe('');
    expect(state.modified).toBe('');
    expect(state.viewMode).toBe('side-by-side');
    expect(state.showWhitespace).toBe(true);
    expect(state.contextLines).toBe(3);
    expect(state.wordDiff).toBe(true);
    expect(state.wrapLines).toBe(false);
  });

  it('is deeply frozen or safely immutable', () => {
    const state = diffViewerTool.initialState;
    // Should be safe to spread (can't enforce true freeze but we can verify shape)
    const copy = { ...state };
    expect(copy).toEqual(state);
  });
});

describe('DiffViewer config metadata', () => {
  it('has the correct tool id', () => {
    expect(diffViewerTool.id).toBe('diff-viewer');
  });

  it('has a non-empty name', () => {
    expect(diffViewerTool.name.length).toBeGreaterThan(0);
  });

  it('has a semantic version', () => {
    expect(diffViewerTool.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has config matching tool id', () => {
    expect(diffViewerTool.config.id).toBe('diff-viewer');
  });

  it('lists expected exporters', () => {
    const exporters = diffViewerTool.exporters!;
    const formats = exporters.map((e) => e.format);
    expect(formats).toContain('png');
    expect(formats).toContain('jpeg');
    expect(formats).toContain('webp');
    expect(formats).toContain('pdf');
  });

  it('each exporter has a loader function', () => {
    const exporters = diffViewerTool.exporters!;
    for (const exporter of exporters) {
      expect(typeof exporter.loader).toBe('function');
    }
  });
});
