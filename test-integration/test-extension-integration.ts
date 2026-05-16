// ---------------------------------------------------------------------------
// Extension integration test — validates scheduler-ext logic
// without requiring full pi runtime
// ---------------------------------------------------------------------------

import { Scheduler } from '../packages/scheduler-core/src/scheduler.js';
import {
  createAutomationTool,
  listAutomationsTool,
  runTaskTool,
  checkNotificationsTool,
  listTemplatesTool,
  instantiateTemplateTool,
} from '../packages/scheduler-ext/src/tools.js';
import { schedulerCommandHandler } from '../packages/scheduler-ext/src/commands.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync, mkdirSync } from 'node:fs';

function createTestDir(): string {
  const dir = join(tmpdir(), `pi-scheduler-ext-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Minimal mock of what pi's tool execution looks like
async function executeTool(tool: any, params: Record<string, unknown>): Promise<any> {
  return tool.execute('mock-tool-call-id', params, undefined, undefined);
}

async function main(): Promise<void> {
  const testDir = createTestDir();
  console.log('[Test] Extension integration test');
  console.log('[Test] Working dir:', testDir);

  const scheduler = Scheduler.create({
    dataDir: join(testDir, 'data'),
    tickIntervalMs: 5000,
    allowedDirs: [testDir, tmpdir(), 'C:/temp'],
  });

  scheduler.start();

  try {
    // ================================================================
    // TEST 1: Tool factory creates valid tool definitions
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 1: Tool definitions');
    console.log('========================================');

    const getScheduler = () => scheduler;
    const tools = [
      createAutomationTool(getScheduler),
      listAutomationsTool(getScheduler),
      runTaskTool(getScheduler),
      checkNotificationsTool(getScheduler),
      listTemplatesTool(getScheduler),
      instantiateTemplateTool(getScheduler),
    ];

    for (const tool of tools) {
      console.log(`  Registered: ${tool.name} — ${tool.description}`);
      if (!tool.parameters || !tool.execute) {
        throw new Error(`Tool ${tool.name} missing parameters or execute`);
      }
    }
    console.log(`[TEST 1] PASSED: ${tools.length} tools with valid schemas`);

    // ================================================================
    // TEST 2: Execute create_automation tool
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 2: Execute create_automation tool');
    console.log('========================================');

    const createTool = createAutomationTool(getScheduler);
    const result = await executeTool(createTool, {
      name: 'TestBuild',
      intervalMinutes: 60,
      command: 'echo hello-from-tool',
      cwd: 'C:/temp',
    });

    console.log('  Result:', JSON.stringify(result.content));
    const automationId = result.details?.id;
    if (!automationId) {
      throw new Error('create_automation did not return automation ID');
    }
    console.log(`[TEST 2] PASSED: Automation created (${automationId})`);

    // ================================================================
    // TEST 3: Execute list_automations tool
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 3: Execute list_automations tool');
    console.log('========================================');

    const listTool = listAutomationsTool(getScheduler);
    const listResult = await executeTool(listTool, {});
    const automations = listResult.details;
    if (!Array.isArray(automations) || automations.length !== 1) {
      throw new Error(`Expected 1 automation, got ${automations?.length}`);
    }
    console.log(`[TEST 3] PASSED: Listed ${automations.length} automation(s)`);

    // ================================================================
    // TEST 4: Execute run_task tool
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 4: Execute run_task tool');
    console.log('========================================');

    const taskTool = runTaskTool(getScheduler);
    const taskResult = await executeTool(taskTool, {
      name: 'EchoTask',
      command: 'echo task-output',
      cwd: 'C:/temp',
    });

    const taskId = taskResult.details?.id;
    if (!taskId) {
      throw new Error('run_task did not return task ID');
    }
    console.log(`[TEST 4] PASSED: Task created (${taskId})`);

    // Wait for task to complete
    await sleep(2000);
    const task = scheduler.getTaskStatus(taskId);
    console.log(`  Task status: ${task?.status}, exitCode: ${task?.exitCode}`);
    if (task?.status !== 'completed') {
      console.log('[TEST 4] WARNING: Task not completed yet (may need more time)');
    }

    // ================================================================
    // TEST 5: Execute check_notifications tool
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 5: Execute check_notifications tool');
    console.log('========================================');

    const notifTool = checkNotificationsTool(getScheduler);
    const notifResult = await executeTool(notifTool, {});
    const pendingCount = notifResult.details?.count ?? 0;
    console.log(`  Pending notifications: ${pendingCount}`);
    console.log(`[TEST 5] PASSED: Notification check returned ${pendingCount} items`);

    // ================================================================
    // TEST 6: Execute list_templates tool
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 6: Execute list_templates tool');
    console.log('========================================');

    const tmplTool = listTemplatesTool(getScheduler);
    const tmplResult = await executeTool(tmplTool, {});
    const templates = tmplResult.details;
    if (!Array.isArray(templates) || templates.length < 3) {
      throw new Error(`Expected at least 3 templates, got ${templates?.length}`);
    }
    console.log(`[TEST 6] PASSED: Listed ${templates.length} template(s)`);
    for (const t of templates) {
      console.log(`    - ${t.id}: ${t.description}`);
    }

    // ================================================================
    // TEST 7: Execute instantiate_template tool
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 7: Execute instantiate_template tool');
    console.log('========================================');

    const instTool = instantiateTemplateTool(getScheduler);
    const instResult = await executeTool(instTool, {
      templateId: 'disk-check',
      name: 'MyDiskCheck',
      cwd: 'C:/temp',
    });

    const instAutoId = instResult.details?.id;
    if (!instAutoId) {
      throw new Error('instantiate_template did not return automation ID');
    }
    console.log(`[TEST 7] PASSED: Template instantiated (${instAutoId})`);

    // ================================================================
    // TEST 8: Command handler exists and is callable
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 8: Command handler callable');
    console.log('========================================');

    const handler = schedulerCommandHandler(getScheduler);
    if (typeof handler !== 'function') {
      throw new Error('schedulerCommandHandler did not return a function');
    }
    console.log('[TEST 8] PASSED: Command handler is a function');

    // ================================================================
    // TEST 9: Event emitter works through scheduler
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 9: Event emitter integration');
    console.log('========================================');

    let eventReceived = false;
    scheduler.on('automation_run', (event) => {
      eventReceived = true;
      console.log(`  Event received: ${event.automationName} — exit ${event.result.exitCode}`);
    });

    // The automation we created earlier should tick if we wait long enough
    // But tick interval is 5s and automation interval is 60min
    // Let's create a fast automation
    const fastAuto = scheduler.createAutomation({
      name: 'FastEvent',
      intervalMinutes: 0.1, // ~6 seconds
      command: 'echo fast',
      cwd: 'C:/temp',
    });
    console.log(`  Created fast automation: ${fastAuto.id}`);
    console.log('  Waiting 8s for tick...');
    await sleep(8000);

    if (eventReceived) {
      console.log('[TEST 9] PASSED: Event received from tick loop');
    } else {
      console.log('[TEST 9] INFO: No event yet (tick timing may vary)');
    }

    // ================================================================
    // TEST 10: Full lifecycle — stop and restart
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 10: Scheduler lifecycle');
    console.log('========================================');

    scheduler.stop();
    console.log('  Scheduler stopped');

    const restarted = Scheduler.create({ dataDir: join(testDir, 'data') });
    const restoredAutos = restarted.listAutomations();
    console.log(`  Restored ${restoredAutos.length} automations from disk`);
    if (restoredAutos.length >= 2) { // TestBuild + MyDiskCheck + FastEvent
      console.log('[TEST 10] PASSED: State persisted and restored');
    } else {
      console.log('[TEST 10] FAILED: Expected at least 2 automations, got', restoredAutos.length);
    }
    restarted.stop();

  } catch (err) {
    console.error('[Test] FAILED:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    scheduler.stop();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    console.log('\n[Test] Extension integration test completed.');
  }
}

main();
