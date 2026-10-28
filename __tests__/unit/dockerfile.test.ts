import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dockerfile = readFileSync(resolve(__dirname, '../../Dockerfile'), 'utf-8');

function runnerStage(): string {
  const runner = stages().runner;
  if (runner === undefined) throw new Error('Dockerfile has no runner stage');
  return runner;
}

/** Split the Dockerfile into its build stages: { name -> stage body }. */
function stages(): Record<string, string> {
  const result: Record<string, string> = {};
  let current = '';

  for (const line of dockerfile.split(/\r?\n/)) {
    const match = /^FROM\s+\S+(?:\s+AS\s+(\S+))?/i.exec(line.trim());
    if (match) {
      current = match[1] ?? '';
      result[current] = '';
      continue;
    }
    if (current) result[current] += `${line}\n`;
  }

  return result;
}

describe('Dockerfile', () => {
  it('creates a dedicated non-root user and group', () => {
    const runner = runnerStage();

    expect(runner).toMatch(/addgroup\s+--system\s+--gid\s+1001\s+nodejs/);
    expect(runner).toMatch(/adduser\s+--system\s+--uid\s+1001\s+nextjs/);
  });

  it('switches the runner stage to the non-root user', () => {
    const runner = runnerStage();

    expect(runner).toMatch(/^USER\s+nextjs$/m);
    expect(runner).not.toMatch(/^USER\s+(root|0)$/m);
  });

  it('applies the non-root user before starting the server', () => {
    const runner = runnerStage();

    const userIndex = runner.search(/^USER\s+nextjs$/m);
    const cmdIndex = runner.search(/^CMD\s+\[/m);

    expect(userIndex).toBeGreaterThan(-1);
    expect(cmdIndex).toBeGreaterThan(userIndex);
  });

  it('does not require root to write the Next.js cache', () => {
    const runner = runnerStage();

    expect(runner).toMatch(/mkdir\s+-p\s+\.next\/cache/);
    expect(runner).toMatch(/chown\s+-R\s+nextjs:nodejs\s+\.next/);
  });
});
