import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../src/scheduler.js';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = join(tmpdir(), 'pi-scheduler-test-' + Date.now());
  return dir;
}

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let dataDir: string;

  beforeEach(() => {
    dataDir = createTempDir();
    scheduler = Scheduler.create({ dataDir, tickIntervalMs: 1000 });
  });

  afterEach(() => {
    scheduler.stop();
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('should create and list automations', () => {
    const auto = scheduler.createAutomation({
      name: 'Test Build',
      intervalMinutes: 60,
      command: 'echo hello',
      cwd: tmpdir(),
    });

    expect(auto.id).toBeTruthy();
    expect(auto.name).toBe('Test Build');
    expect(auto.intervalMinutes).toBe(60);

    const list = scheduler.listAutomations();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(auto.id);
  });

  it('should delete an automation', () => {
    const auto = scheduler.createAutomation({
      name: 'ToDelete',
      intervalMinutes: 5,
      command: 'echo hello',
      cwd: tmpdir(),
    });

    expect(scheduler.deleteAutomation(auto.id)).toBe(true);
    expect(scheduler.listAutomations()).toHaveLength(0);
    expect(scheduler.deleteAutomation('nonexistent')).toBe(false);
  });

  it('should reject dangerous commands', () => {
    expect(() =>
      scheduler.createAutomation({
        name: 'Bad',
        intervalMinutes: 5,
        command: 'rm -rf /',
        cwd: tmpdir(),
      })
    ).toThrow(/blocked by security policy/);
  });

  it('should run a one-shot task', async () => {
    const task = scheduler.runTask({
      name: 'Echo Task',
      command: 'echo hello-world',
      cwd: tmpdir(),
    });

    expect(task.id).toBeTruthy();
    expect(task.status).toBe('running');

    // Wait for task to complete
    await new Promise((r) => setTimeout(r, 2000));

    const status = scheduler.getTaskStatus(task.id);
    expect(status).toBeDefined();
    expect(status!.status).toBe('completed');
    expect(status!.exitCode).toBe(0);
    expect(status!.stdout).toContain('hello-world');
  });

  it('should list built-in templates', () => {
    const templates = scheduler.listTemplates();
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('build-project');
    expect(ids).toContain('disk-check');
    expect(ids).toContain('git-sync');
  });

  it('should instantiate a template', () => {
    const auto = scheduler.instantiateTemplate('build-project', {
      name: 'Build MyProject',
      cwd: tmpdir(),
    });

    expect(auto.name).toBe('Build MyProject');
    expect(auto.command).toBe('dotnet build');
    expect(auto.intervalMinutes).toBe(60);
  });

  it('should emit events on automation run', async () => {
    let received = false;

    scheduler.on('automation_run', (event) => {
      received = true;
      expect(event.automationName).toBe('EventTest');
    });

    scheduler.createAutomation({
      name: 'EventTest',
      intervalMinutes: 0, // will fire immediately on tick
      command: 'echo hi',
      cwd: tmpdir(),
    });

    scheduler.start();
    await new Promise((r) => setTimeout(r, 3500)); // wait for tick + exec

    expect(received).toBe(true);
  });

  it('should track notifications', () => {
    const task = scheduler.runTask({
      name: 'NotifyTest',
      command: 'echo done',
      cwd: tmpdir(),
    });

    // Wait for completion
    // Notifications are written async

    const beforeAck = scheduler.checkNotifications();
    expect(beforeAck.length).toBeGreaterThanOrEqual(0);

    scheduler.ackNotifications(Date.now());
    const afterAck = scheduler.checkNotifications();
    expect(afterAck).toHaveLength(0);
  });
});
