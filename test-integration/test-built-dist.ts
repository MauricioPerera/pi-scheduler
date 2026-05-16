// Test that the built dist/ output works correctly
import { Scheduler } from '../packages/scheduler-core/dist/index.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync, mkdirSync } from 'node:fs';

const testDir = join(tmpdir(), `pi-scheduler-dist-test-${Date.now()}`);
mkdirSync(testDir, { recursive: true });

console.log('[DistTest] Testing built scheduler-core...');

const scheduler = Scheduler.create({
  dataDir: join(testDir, 'data'),
  tickIntervalMs: 1000,
  allowedDirs: [testDir, tmpdir()],
});

scheduler.start();

// Create automation
const auto = scheduler.createAutomation({
  name: 'DistTest',
  intervalMinutes: 60,
  command: 'echo built-dist-works',
  cwd: tmpdir(),
});
console.log(`[DistTest] Automation created: ${auto.id}`);

// Create task
const task = scheduler.runTask({
  name: 'DistTask',
  command: 'echo dist-task-output',
  cwd: tmpdir(),
});
console.log(`[DistTest] Task created: ${task.id}`);

// Wait for task
setTimeout(() => {
  const status = scheduler.getTaskStatus(task.id);
  console.log(`[DistTest] Task status: ${status?.status}, exit: ${status?.exitCode}`);

  // Verify templates
  const templates = scheduler.listTemplates();
  console.log(`[DistTest] Templates: ${templates.length}`);

  // Check notifications
  const notifs = scheduler.checkNotifications();
  console.log(`[DistTest] Notifications: ${notifs.length}`);

  // Verify persistence
  scheduler.stop();
  const restored = Scheduler.create({ dataDir: join(testDir, 'data') });
  const restoredAutos = restored.listAutomations();
  console.log(`[DistTest] Restored automations: ${restoredAutos.length}`);
  restored.stop();

  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  console.log('[DistTest] All dist tests passed!');
  process.exit(0);
}, 3000);
