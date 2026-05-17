import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../src/scheduler.js';
import { rmSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = join(tmpdir(), `pi-scheduler-unit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let dataDir: string;

  beforeEach(() => {
    dataDir = createTempDir();
    scheduler = Scheduler.create({ dataDir, tickIntervalMs: 1000, allowedDirs: [tmpdir()] });
  });

  afterEach(() => {
    scheduler.stop();
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  });

  describe('createAutomation', () => {
    it('creates a valid automation with command', () => {
      const auto = scheduler.createAutomation({
        name: 'Test Build',
        intervalMinutes: 60,
        command: 'dotnet build',
        cwd: tmpdir(),
      });
      expect(auto.id).toBeTruthy();
      expect(auto.name).toBe('Test Build');
      expect(auto.intervalMinutes).toBe(60);
      expect(auto.command).toBe('dotnet build');
      expect(auto.script).toBeNull();
      expect(auto.logs).toEqual([]);
    });

    it('creates a valid automation with script', () => {
      const auto = scheduler.createAutomation({
        name: 'JS Script',
        intervalMinutes: 5,
        script: "console.log('hello')",
        scriptType: 'javascript',
        cwd: tmpdir(),
      });
      expect(auto.id).toBeTruthy();
      expect(auto.scriptType).toBe('javascript');
      expect(auto.command).toBeNull();
      expect(auto.script).toBe("console.log('hello')");
    });

    it('throws when neither command nor script is provided', () => {
      expect(() =>
        scheduler.createAutomation({
          name: 'Empty',
          intervalMinutes: 5,
          cwd: tmpdir(),
        })
      ).toThrow(/provide either/i);
    });

    it('throws on dangerous commands', () => {
      expect(() =>
        scheduler.createAutomation({
          name: 'Bad',
          intervalMinutes: 5,
          command: 'rm -rf /',
          cwd: tmpdir(),
        })
      ).toThrow(/blocked by security policy/);
    });

    it('throws on blocked cwd', () => {
      expect(() =>
        scheduler.createAutomation({
          name: 'Bad',
          intervalMinutes: 5,
          command: 'echo hi',
          cwd: 'C:/Windows',
        })
      ).toThrow(/Working directory blocked/);
    });

    it('persists and restores after recreation', () => {
      const auto = scheduler.createAutomation({
        name: 'Persistent',
        intervalMinutes: 10,
        command: 'echo persist',
        cwd: tmpdir(),
      });
      const id = auto.id;
      scheduler.stop();

      // Recreate scheduler from same data dir
      const restored = Scheduler.create({ dataDir });
      const found = restored.getAutomation(id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Persistent');
      restored.stop();
    });
  });

  describe('deleteAutomation', () => {
    it('deletes an existing automation', () => {
      const auto = scheduler.createAutomation({
        name: 'ToDelete',
        intervalMinutes: 5,
        command: 'echo hi',
        cwd: tmpdir(),
      });
      expect(scheduler.deleteAutomation(auto.id)).toBe(true);
      expect(scheduler.getAutomation(auto.id)).toBeUndefined();
    });

    it('returns false for nonexistent id', () => {
      expect(scheduler.deleteAutomation('nonexistent')).toBe(false);
    });
  });

  describe('getAutomationLogs', () => {
    it('returns empty array for new automation', () => {
      const auto = scheduler.createAutomation({
        name: 'NoLogs',
        intervalMinutes: 5,
        command: 'echo hi',
        cwd: tmpdir(),
      });
      expect(scheduler.getAutomationLogs(auto.id)).toEqual([]);
    });
  });

  describe('consecutiveFailures backoff', () => {
    it('increments consecutiveFailures on failed automation run', async () => {
      const s = Scheduler.create({
        dataDir: createTempDir(),
        tickIntervalMs: 50,
        allowedDirs: [tmpdir()],
        subagentExecutor: async () => ({ exitCode: 1, stdout: '', stderr: 'boom' }),
      });
      const auto = s.createAutomation({
        name: 'BackoffTest', intervalMinutes: 60, cwd: tmpdir(),
        subagentConfig: { task: 'test' },
      });

      s.start();
      await new Promise<void>((resolve) => { s.on('automation_run', () => resolve()); });
      s.stop();

      expect(auto.consecutiveFailures).toBe(1);
    });

    it('applies exponential backoff after repeated failures', async () => {
      const s = Scheduler.create({
        dataDir: createTempDir(),
        tickIntervalMs: 50,
        allowedDirs: [tmpdir()],
        subagentExecutor: async () => ({ exitCode: 1, stdout: '', stderr: 'boom' }),
      });
      const auto = s.createAutomation({
        name: 'BackoffRepeat', intervalMinutes: 1, cwd: tmpdir(),
        subagentConfig: { task: 'test' },
      });
      auto.consecutiveFailures = 3;

      s.start();
      await new Promise<void>((resolve) => { s.on('automation_run', () => resolve()); });
      s.stop();

      expect(auto.consecutiveFailures).toBe(4);
      // backoff = min(60000ms * 2^3, 24h) = 480000ms
      const expectedMs = Math.min(60000 * Math.pow(2, 3), 24 * 60 * 60 * 1000);
      expect(auto.nextRun).toBeGreaterThan(Date.now() + expectedMs / 2);
    });

    it('resets consecutiveFailures to 0 on success', async () => {
      const s = Scheduler.create({
        dataDir: createTempDir(),
        tickIntervalMs: 50,
        allowedDirs: [tmpdir()],
        subagentExecutor: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
      });
      const auto = s.createAutomation({
        name: 'SuccessReset', intervalMinutes: 60, cwd: tmpdir(),
        subagentConfig: { task: 'test' },
      });
      auto.consecutiveFailures = 5;

      s.start();
      await new Promise<void>((resolve) => { s.on('automation_run', () => resolve()); });
      s.stop();

      expect(auto.consecutiveFailures).toBe(0);
    });
  });

  describe('task recovery on restart', () => {
    it('marks running tasks as failed when scheduler restarts', () => {
      const task = scheduler.runTask({
        name: 'LongTask',
        command: 'echo hi',
        cwd: tmpdir(),
        timeoutMs: 60000,
      });
      const id = task.id;
      scheduler.stop();

      // Force the persisted task back to running to simulate a crash
      const tasksFile = join(dataDir, 'tasks.json');
      const current = JSON.parse(readFileSync(tasksFile, 'utf8'));
      for (const t of current) {
        if (t.id === id) t.status = 'running';
      }
      writeFileSync(tasksFile, JSON.stringify(current, null, 2));

      // Restart: constructor should recover orphaned task
      const restarted = Scheduler.create({ dataDir, allowedDirs: [tmpdir()] });
      const recovered = restarted.getTaskStatus(id);
      expect(recovered).toBeDefined();
      expect(recovered!.status).toBe('failed');
      expect(recovered!.exitCode).toBe(-1);
      expect(recovered!.stderr).toMatch(/interrupted/i);
      expect(recovered!.completedAt).not.toBeNull();
      restarted.stop();
    });
  });
});



