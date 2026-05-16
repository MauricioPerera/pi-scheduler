import { Scheduler } from '../packages/scheduler-core/src/scheduler.js';
import { WebhookTestServer } from './webhook-server/server.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, mkdirSync } from 'node:fs';

const TEST_DIR = join(tmpdir(), `pi-scheduler-daemon-test-${Date.now()}`);
rmSync(TEST_DIR, { recursive: true, force: true });
mkdirSync(TEST_DIR, { recursive: true });

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`[Test] Daemon + Webhook real test`);
  console.log(`[Test] Data dir: ${TEST_DIR}`);

  const webhook = new WebhookTestServer();
  await webhook.start();
  console.log(`[Test] Webhook listening at ${webhook.getUrl()}`);

  const scheduler = Scheduler.create({
    dataDir: TEST_DIR,
    tickIntervalMs: 3000,
    logger: {
      info: (m) => console.log(`[Scheduler] ${m}`),
      warn: (m) => console.warn(`[Scheduler] ${m}`),
      error: (m) => console.error(`[Scheduler] ${m}`),
    },
  });

  scheduler.setWebhookUrl(webhook.getUrl());
  scheduler.start();
  scheduler.on('automation_run', (ev) => console.log('[Event] automation_run', ev.automationId, ev.result?.exitCode));
  scheduler.on('error', (ev) => console.log('[Event] error', ev.message));
  console.log('[Test] Scheduler started with 3s tick interval');

  const auto = scheduler.createAutomation({
    name: 'webhook-test',
    intervalMinutes: 0.05,
    command: 'echo daemon-webhook-fired',
    cwd: 'C:/temp',
  });
  console.log(`[Test] Created automation ${auto.id}`);
  console.log('[Test] Automations count:', scheduler.listAutomations().length);

  console.log('[Test] Waiting 12s for tick and webhook...');
  await sleep(12000);

  const logs = scheduler.getAutomationLogs(auto.id);
  console.log(`[Test] Automation logs: ${logs.length}`);
  for (const log of logs) {
    console.log(`  [${log.time}] exit=${log.exitCode} stdout=${log.stdout?.trim()}`);
  }

  const pending = scheduler.checkNotifications();
  console.log(`[Test] Pending notifications: ${pending.length}`);
  for (const n of pending) {
    console.log(`  ${n.type} | ${JSON.stringify(n).slice(0,120)}`);
  }

  console.log(`[Test] Webhook records: ${webhook.records.length}`);
  for (const r of webhook.records) {
    console.log(`  - ${r.body?.type} | ${JSON.stringify(r.body).slice(0, 120)}`);
  }

  const autoRecords = webhook.records.filter(r => r.body?.type === 'automation_run' && r.body?.automationId === auto.id);
  if (autoRecords.length > 0) {
    console.log(`[Test] PASSED: Webhook received ${autoRecords.length} automation_run notification(s)`);
  } else {
    console.log(`[Test] FAILED: No automation_run notification received for ${auto.id}`);
  }

  scheduler.stop();
  await webhook.stop();
  rmSync(TEST_DIR, { recursive: true, force: true });
  console.log('[Test] Cleaned up');
}

main().catch(e => { console.error(e); process.exit(1); });
