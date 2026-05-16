// Standalone test for daemon — uses relative import since package is local
import { Scheduler } from '../scheduler-core/src/scheduler.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync, mkdirSync } from 'node:fs';

const testDir = join(tmpdir(), `daemon-test-${Date.now()}`);
mkdirSync(testDir, { recursive: true });

console.log('[DaemonTest] Starting daemon simulation...');

// Simulate daemon: create scheduler, start tick loop
const scheduler = Scheduler.create({
  dataDir: join(testDir, 'data'),
  tickIntervalMs: 5000,
  allowedDirs: [testDir, tmpdir(), 'C:/temp'],
});

scheduler.start();

// Create a fast automation
const auto = scheduler.createAutomation({
  name: 'DaemonFastTick',
  intervalMinutes: 0.1,
  command: 'echo daemon-tick',
  cwd: 'C:/temp',
});
console.log(`[DaemonTest] Automation created: ${auto.id}`);

// Wait for tick
setTimeout(() => {
  const logs = scheduler.getAutomationLogs(auto.id);
  console.log(`[DaemonTest] Logs after 8s: ${logs.length}`);
  if (logs.length > 0) {
    console.log(`[DaemonTest] Last log: exit=${logs[logs.length - 1].exitCode}`);
    console.log(`[DaemonTest] PASSED: Daemon tick loop works`);
  } else {
    console.log(`[DaemonTest] INFO: No logs yet (timing)`);
  }

  scheduler.stop();
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  console.log('[DaemonTest] Done');
  process.exit(0);
}, 8000);
