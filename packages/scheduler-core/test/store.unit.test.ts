import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { loadAutomations, loadTasks } from '../src/store.js';

const BASE = join(tmpdir(), `pi-store-test-${process.pid}`);
beforeAll(() => mkdirSync(BASE, { recursive: true }));
afterAll(() => rmSync(BASE, { recursive: true, force: true }));

function tmpFile(name: string): string {
  return join(BASE, `${name}-${Date.now()}.json`);
}

describe('loadAutomations', () => {
  it('returns empty map and creates .bak when file is corrupted', () => {
    const f = tmpFile('automations-bad');
    writeFileSync(f, 'not valid json', 'utf8');
    const map = loadAutomations(f);
    expect(map.size).toBe(0);
    const baks = readdirSync(BASE).filter((n) => n.includes('.corrupted-') && n.includes('.bak'));
    expect(baks.length).toBeGreaterThan(0);
  });

  it('loads valid automations without creating a .bak', () => {
    const f = tmpFile('automations-ok');
    const before = readdirSync(BASE).filter((n) => n.includes('.bak')).length;
    writeFileSync(f, JSON.stringify([
      { id: 'a1', name: 'Test', intervalMinutes: 5, command: 'echo hi',
        cwd: tmpdir(), script: null, scriptType: 'javascript', model: null,
        reasoningEffort: null, subagentConfig: null, nextRun: 0, logs: [] },
    ]), 'utf8');
    const map = loadAutomations(f);
    const after = readdirSync(BASE).filter((n) => n.includes('.bak')).length;
    expect(map.size).toBe(1);
    expect(map.get('a1')?.name).toBe('Test');
    expect(after).toBe(before);
  });
});

describe('loadTasks', () => {
  it('returns empty map and creates .bak when file is corrupted', () => {
    const f = tmpFile('tasks-bad');
    writeFileSync(f, '{broken', 'utf8');
    const before = readdirSync(BASE).filter((n) => n.includes('.bak')).length;
    const map = loadTasks(f);
    const after = readdirSync(BASE).filter((n) => n.includes('.bak')).length;
    expect(map.size).toBe(0);
    expect(after).toBeGreaterThan(before);
  });
});
