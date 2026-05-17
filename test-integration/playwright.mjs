/**
 * Optional Playwright integration test for pi-scheduler.
 * Verifies that the scheduler correctly executes Playwright scripts via
 * the url-health-check and web-screenshot built-in templates.
 *
 * Prerequisites: npm install playwright && npx playwright install chromium
 * Run: node test-integration/playwright.mjs
 */

import { Scheduler } from '../packages/scheduler-core/dist/index.js';
import { BUILTIN_TEMPLATES, interpolateTemplate } from '../packages/scheduler-core/dist/templates.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

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
// Check Playwright availability
// ---------------------------------------------------------------------------

console.log('\npi-scheduler Playwright integration test\n');

const localReq = createRequire(process.cwd() + '/package.json');
try {
  localReq.resolve('playwright');
} catch {
  console.log(`\x1b[33m·\x1b[0m Playwright not found in ${process.cwd()}/node_modules — skipping.`);
  console.log(`  Install with: npm install playwright && npx playwright install chromium`);
  process.exit(0);
}

console.log(`${INFO} Playwright found. Running tests...\n`);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const dataDir = join(tmpdir(), `pi-scheduler-playwright-${Date.now()}`);
const screenshotDir = join(tmpdir(), `pi-scheduler-pw-screenshots-${Date.now()}`);
mkdirSync(dataDir, { recursive: true });
mkdirSync(screenshotDir, { recursive: true });

const scheduler = Scheduler.create({
  dataDir,
  allowedDirs: [tmpdir(), process.cwd()],
});

// Helper: get interpolated script from a built-in template
function getScript(templateId, params) {
  const t = BUILTIN_TEMPLATES.find((x) => x.id === templateId);
  const result = interpolateTemplate(t, params);
  return result.script;
}

// ---------------------------------------------------------------------------
// 1. url-health-check — expects HTTP 200 from example.com
// ---------------------------------------------------------------------------

console.log('1. url-health-check');

const healthScript = getScript('url-health-check', { url: 'https://example.com' });

const healthTask = scheduler.runTask({
  name: 'pw-health-check',
  cwd: process.cwd(),
  script: healthScript,
  scriptType: 'javascript',
  timeoutMs: 30000,
});

assert('health check task started', healthTask.status === 'running');
console.log(`  ${INFO} waiting for Playwright health check...`);

await new Promise((r) => setTimeout(r, 20000));
const healthResult = scheduler.getTaskStatus(healthTask.id);

assert('health check completed', healthResult?.status === 'completed', healthResult?.status);
assert('health check exitCode 0', healthResult?.exitCode === 0, String(healthResult?.exitCode));
assert('stdout confirms pass', healthResult?.stdout?.includes('passed'), JSON.stringify(healthResult?.stdout?.trim()));

// ---------------------------------------------------------------------------
// 2. web-screenshot — verifies screenshot.png is created on disk
// ---------------------------------------------------------------------------

console.log('\n2. web-screenshot');

const screenshotScript = getScript('web-screenshot', { url: 'https://example.com' });

const screenshotTask = scheduler.runTask({
  name: 'pw-screenshot',
  cwd: screenshotDir,
  script: screenshotScript,
  scriptType: 'javascript',
  timeoutMs: 30000,
});

assert('screenshot task started', screenshotTask.status === 'running');
console.log(`  ${INFO} waiting for Playwright screenshot...`);

await new Promise((r) => setTimeout(r, 20000));
const screenshotResult = scheduler.getTaskStatus(screenshotTask.id);

assert('screenshot task completed', screenshotResult?.status === 'completed', screenshotResult?.status);
assert('screenshot exitCode 0', screenshotResult?.exitCode === 0, String(screenshotResult?.exitCode));
assert('screenshot.png created on disk', existsSync(join(screenshotDir, 'screenshot.png')));

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

scheduler.stop();
rmSync(dataDir, { recursive: true, force: true });
rmSync(screenshotDir, { recursive: true, force: true });

console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
