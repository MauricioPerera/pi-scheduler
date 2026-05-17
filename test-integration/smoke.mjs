/**
 * End-to-end smoke test — uses pi-scheduler-core (from source via workspace)
 * and a real claude CLI call to verify the full execution pipeline.
 *
 * Run: node test-integration/smoke.mjs
 */

import { Scheduler } from '../packages/scheduler-core/dist/index.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const INFO = '\x1b[36m·\x1b[0m';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`${PASS} ${label}`);
    passed++;
  } else {
    console.log(`${FAIL} ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const dataDir = join(tmpdir(), `pi-scheduler-smoke-${Date.now()}`);
mkdirSync(dataDir, { recursive: true });

const scheduler = Scheduler.create({
  dataDir,
  allowedDirs: [tmpdir()],
  logger: {
    info: (m) => console.log(`  ${INFO} [scheduler] ${m}`),
    warn: (m) => console.warn(`  ${INFO} [scheduler] ${m}`),
    error: (m) => console.error(`  ${INFO} [scheduler] ${m}`),
  },
});

console.log('\npi-scheduler smoke test\n');

// ---------------------------------------------------------------------------
// 1. Basic task — echo (verifies executor pipeline)
// ---------------------------------------------------------------------------

console.log('1. Basic task (echo)');

const echoTask = scheduler.runTask({
  name: 'echo-test',
  command: 'echo SCHEDULER_ECHO_OK',
  cwd: tmpdir(),
});

assert('task created with status running', echoTask.status === 'running');

await new Promise((r) => setTimeout(r, 2000));
const echoResult = scheduler.getTaskStatus(echoTask.id);

assert('echo task completed', echoResult?.status === 'completed', echoResult?.status);
assert('echo stdout correct', echoResult?.stdout?.includes('SCHEDULER_ECHO_OK'), JSON.stringify(echoResult?.stdout));
assert('echo exitCode 0', echoResult?.exitCode === 0, String(echoResult?.exitCode));

// ---------------------------------------------------------------------------
// 2. Task recovery — orphaned running task on restart
// ---------------------------------------------------------------------------

console.log('\n2. Task recovery on restart');

const orphanTask = scheduler.runTask({
  name: 'orphan-test',
  command: 'echo will-be-orphaned',
  cwd: tmpdir(),
});

scheduler.stop();

// Force back to running in the persisted JSON
import { readFileSync, writeFileSync } from 'node:fs';
const tasksFile = join(dataDir, 'tasks.json');
const tasks = JSON.parse(readFileSync(tasksFile, 'utf8'));
for (const t of tasks) {
  if (t.id === orphanTask.id) t.status = 'running';
}
writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));

const scheduler2 = Scheduler.create({ dataDir, allowedDirs: [tmpdir()] });
const recovered = scheduler2.getTaskStatus(orphanTask.id);

assert('orphaned task recovered as failed', recovered?.status === 'failed', recovered?.status);
assert('orphaned task has exitCode -1', recovered?.exitCode === -1, String(recovered?.exitCode));
assert('orphaned task stderr describes interruption', recovered?.stderr?.includes('interrupted'), recovered?.stderr);

// ---------------------------------------------------------------------------
// 3. Real LLM task — claude CLI
// ---------------------------------------------------------------------------

console.log('\n3. Real LLM task (claude CLI)');

const llmTask = scheduler2.runTask({
  name: 'llm-ping',
  command: 'claude -p "respond with exactly the word SCHEDULER_LLM_OK and nothing else"',
  cwd: tmpdir(),
  timeoutMs: 60000,
});

assert('LLM task started', llmTask.status === 'running');
console.log(`  ${INFO} waiting for claude response...`);

await new Promise((r) => setTimeout(r, 30000));
const llmResult = scheduler2.getTaskStatus(llmTask.id);

assert('LLM task completed', llmResult?.status === 'completed', llmResult?.status);
assert('LLM stdout contains expected token', llmResult?.stdout?.includes('SCHEDULER_LLM_OK'), JSON.stringify(llmResult?.stdout?.trim()));
assert('LLM exitCode 0', llmResult?.exitCode === 0, String(llmResult?.exitCode));

// ---------------------------------------------------------------------------
// 4. Security — blocklist enforcement
// ---------------------------------------------------------------------------

console.log('\n4. Security blocklist');

let blockedRmRf = false;
try {
  scheduler2.runTask({ name: 'bad', command: 'rm -rf /', cwd: tmpdir() });
} catch {
  blockedRmRf = true;
}
assert('rm -rf / blocked', blockedRmRf);

let blockedCwd = false;
try {
  scheduler2.runTask({ name: 'bad-cwd', command: 'echo hi', cwd: 'C:/Windows' });
} catch {
  blockedCwd = true;
}
assert('C:/Windows cwd blocked', blockedCwd);

// ---------------------------------------------------------------------------
// 5. Templates
// ---------------------------------------------------------------------------

console.log('\n5. Templates');

const templates = scheduler2.listTemplates();
assert('11 built-in templates', templates.length === 11, String(templates.length));

const ids = templates.map((t) => t.id);
for (const expected of [
  'build-project', 'disk-check', 'git-sync', 'npm-test', 'npm-outdated',
  'memory-check', 'service-ping', 'git-log',
  'nightly-review', 'daily-research', 'weekly-audit',
]) {
  assert(`template ${expected} present`, ids.includes(expected));
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

scheduler2.stop();
rmSync(dataDir, { recursive: true, force: true });

console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
