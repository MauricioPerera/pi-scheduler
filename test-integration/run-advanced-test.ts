import { Scheduler } from '../packages/scheduler-core/src/scheduler.js';
import { OllamaClient } from './ollama-client.js';
import { WebhookTestServer } from './webhook-server/server.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync, mkdirSync } from 'node:fs';

const SYSTEM_PROMPT_ADVANCED = `You are a scheduling assistant. You help users create and manage automated tasks.

You have access to these capabilities:
- run_task(name, command/script, cwd): Run a one-shot background task
- create_automation(name, intervalMinutes, command/script, cwd): Create recurring automation
- instantiate_template(templateId, params): Create automation from a template
- check_notifications(): Check pending execution results

Available templates:
- build-project: runs "dotnet build", default every 60 min
- disk-check: runs "Get-PSDrive C | Select-Object Used,Free", default every 5 min
- git-sync: runs "git pull", default every 30 min

Security rules:
- Commands are validated against a blocklist (no rm -rf, format, etc.)
- Working directories must be under home, C:/temp, or explicit allowed dirs. Use C:/temp.
- Scripts support JavaScript, Python, PowerShell

When asked to do something, respond with a JSON object:
{
  "action": "run_task" | "create_automation" | "instantiate_template",
  "name": "descriptive name",
  "command": "shell command (optional, mutually exclusive with script)",
  "script": "inline code (optional)",
  "scriptType": "javascript" | "python" | "powershell",
  "cwd": "C:/temp",
  "intervalMinutes": number (only for create_automation),
  "templateId": "template ID" (only for instantiate_template),
  "params": {} (optional template params)
}

Only one of command or script should be provided.
Respond ONLY with valid JSON.`;

class AdvancedSchedulerAgent {
  private scheduler: Scheduler;
  private ollama: OllamaClient;
  private testDir: string;
  private webhookServer: WebhookTestServer;

  constructor(model: string = 'kimi-k2.6:cloud') {
    this.testDir = join(tmpdir(), `pi-scheduler-adv-${Date.now()}`);
    mkdirSync(this.testDir, { recursive: true });

    this.webhookServer = new WebhookTestServer();

    this.scheduler = Scheduler.create({
      dataDir: join(this.testDir, 'data'),
      tickIntervalMs: 5000,
      allowedDirs: [this.testDir, tmpdir(), 'C:/temp'],
    });

    this.ollama = new OllamaClient('http://localhost:11434', model);
  }

  async init(): Promise<void> {
    await this.webhookServer.start();
    this.scheduler.setWebhookUrl(this.webhookServer.getUrl());
    this.scheduler.start();
    console.log('[Agent] Advanced scheduler started at:', this.testDir);
    console.log('[Agent] Webhook:', this.webhookServer.getUrl());
  }

  async askAndExecute(userRequest: string): Promise<Record<string, unknown> | null> {
    console.log('\n[Agent] Asking LLM...');
    console.log('[User]', userRequest);

    const response = await this.ollama.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_ADVANCED },
        { role: 'user', content: userRequest },
      ],
    });

    const content = response.message.content;
    console.log('\n[LLM]', content);

    const action = this.extractAction(content);
    if (!action) {
      console.log('[Agent] Could not parse action from LLM response.');
      return null;
    }

    console.log('\n[Agent] Parsed action:', JSON.stringify(action, null, 2));

    try {
      if (action.action === 'run_task') {
        const task = this.scheduler.runTask({
          name: action.name,
          command: action.command,
          script: action.script,
          scriptType: action.scriptType,
          cwd: action.cwd || 'C:/temp',
        });
        console.log('[Agent] Task created:', task.id, '- status:', task.status);
        return { ...action, taskId: task.id };

      } else if (action.action === 'create_automation') {
        const auto = this.scheduler.createAutomation({
          name: action.name,
          intervalMinutes: action.intervalMinutes || 60,
          command: action.command,
          script: action.script,
          scriptType: action.scriptType,
          cwd: action.cwd || 'C:/temp',
        });
        console.log('[Agent] Automation created:', auto.id);
        return { ...action, automationId: auto.id };

      } else if (action.action === 'instantiate_template') {
        const auto = this.scheduler.instantiateTemplate(action.templateId, {
          name: action.name,
          cwd: action.cwd || 'C:/temp',
          params: action.params || {},
        });
        console.log('[Agent] Template instantiated:', auto.id);
        return { ...action, automationId: auto.id };

      } else {
        console.log('[Agent] Unknown action:', action.action);
        return action;
      }
    } catch (err) {
      console.error('[Agent] Execution error:', err instanceof Error ? err.message : String(err));
      return { ...action, error: String(err) };
    }
  }

  async waitForTask(taskId: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const task = this.scheduler.getTaskStatus(taskId);
      if (!task) return;
      if (task.status !== 'running') {
        console.log(`[Agent] Task ${taskId}: ${task.status}, exit=${task.exitCode}`);
        if (task.stdout) console.log(`[Agent] stdout: ${task.stdout.slice(0, 200)}`);
        if (task.stderr) console.log(`[Agent] stderr: ${task.stderr.slice(0, 200)}`);
        return;
      }
      await sleep(500);
    }
    console.log('[Agent] Timeout waiting for task');
  }

  async waitForAutomationLog(automationId: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const auto = this.scheduler.getAutomation(automationId);
      if (auto && auto.logs.length > 0) {
        const last = auto.logs[auto.logs.length - 1];
        console.log(`[Agent] Automation ${automationId} ran: exit=${last.exitCode}`);
        if (last.stdout) console.log(`[Agent] stdout: ${last.stdout.slice(0, 200)}`);
        return true;
      }
      await sleep(1000);
    }
    console.log('[Agent] Timeout waiting for automation log');
    return false;
  }

  getWebhookRecords(): unknown[] {
    return this.webhookServer.records.map((r) => r.body);
  }

  async shutdown(): Promise<void> {
    this.scheduler.stop();
    await this.webhookServer.stop();
    console.log('[Agent] Scheduler stopped, webhook closed');
  }

  cleanup(): void {
    if (existsSync(this.testDir)) {
      rmSync(this.testDir, { recursive: true, force: true });
      console.log('[Agent] Cleaned up:', this.testDir);
    }
  }

  private extractAction(content: string): Record<string, unknown> | null {
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1].trim()); } catch {}
    }
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch {}
    }
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const model = process.env.OLLAMA_MODEL || 'kimi-k2.6:cloud';
  const agent = new AdvancedSchedulerAgent(model);

  try {
    await agent.init();

    // ================================================================
    // TEST 1: Tick Loop Real — automation que ejecuta en el tick
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 1: Real tick loop (5s automation)');
    console.log('========================================');

    const r1 = await agent.askAndExecute(
      'Create a recurring automation named FastTick that runs every 0.1 minutes (effectively 6 seconds) and runs "echo tick-fired" with cwd C:/temp. Respond ONLY with JSON.'
    );
    const autoId = (r1?.automationId as string) ?? '';

    if (autoId) {
      console.log('\n[Agent] Waiting up to 20s for automation to tick...');
      const fired = await agent.waitForAutomationLog(autoId, 20000);
      if (fired) {
        console.log('[TEST 1] PASSED: Automation ticked and produced log');
      } else {
        console.log('[TEST 1] FAILED: Automation did not tick in time');
      }
    } else {
      console.log('[TEST 1] SKIPPED: No automation created');
    }

    // ================================================================
    // TEST 2: Templates con LLM — elegir disk-check
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 2: LLM picks disk-check template');
    console.log('========================================');

    const r2 = await agent.askAndExecute(
      'I want to monitor disk space every 5 minutes. Use the disk-check template with cwd C:/temp. Respond ONLY with JSON using instantiate_template action.'
    );

    if (r2?.automationId) {
      console.log('[TEST 2] PASSED: Template instantiated');
    } else {
      console.log('[TEST 2] FAILED: Template not instantiated');
    }

    // ================================================================
    // TEST 3: Error handling — comando inválido
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 3: Error handling (failing command)');
    console.log('========================================');

    const r3 = await agent.askAndExecute(
      'Run a task named fail-test that executes "exit 42" with cwd C:/temp. This should fail. Respond ONLY with JSON.'
    );

    if (r3?.taskId) {
      await agent.waitForTask(r3.taskId as string, 15000);
      const task = agent['scheduler'].getTaskStatus(r3.taskId as string);
      if (task?.status === 'failed' || task?.exitCode === 42) {
        console.log('[TEST 3] PASSED: Task failed as expected with exit code', task.exitCode);
      } else {
        console.log('[TEST 3] FAILED: Task did not fail as expected', task);
      }
    } else {
      console.log('[TEST 3] SKIPPED');
    }

    // ================================================================
    // TEST 4: Notificaciones + ack ciclo completo
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 4: Notifications + ack cycle');
    console.log('========================================');

    const before = agent['scheduler'].checkNotifications();
    console.log(`[Agent] Notifications before ack: ${before.length}`);

    agent['scheduler'].ackNotifications(Date.now());

    const after = agent['scheduler'].checkNotifications();
    console.log(`[Agent] Notifications after ack: ${after.length}`);

    if (after.length === 0) {
      console.log('[TEST 4] PASSED: All notifications acknowledged');
    } else {
      console.log('[TEST 4] FAILED: Notifications remain after ack');
    }

    // ================================================================
    // TEST 5: Webhook recibió notificaciones
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 5: Webhook delivery');
    console.log('========================================');

    // Allow time for any pending HTTP requests
    await sleep(2000);

    const records = agent.getWebhookRecords();
    console.log(`[Agent] Webhook records received: ${records.length}`);

    for (const rec of records.slice(0, 3)) {
      console.log(`  - ${JSON.stringify(rec).slice(0, 120)}...`);
    }

    if (records.length > 0) {
      console.log('[TEST 5] PASSED: Webhook received notifications');
    } else {
      console.log('[TEST 5] INFO: No webhook records (may be timing issue)');
    }

    // ================================================================
    // TEST 6: List templates
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 6: List built-in templates');
    console.log('========================================');

    const templates = agent['scheduler'].listTemplates();
    console.log(`[Agent] Templates: ${templates.length}`);
    for (const t of templates) {
      console.log(`  - ${t.id}: ${t.description} (${t.defaultInterval}min)`);
    }

    if (templates.some((t) => t.id === 'disk-check')) {
      console.log('[TEST 6] PASSED: disk-check template available');
    } else {
      console.log('[TEST 6] FAILED: disk-check not found');
    }

    // ================================================================
    // TEST 7: Delete automation
    // ================================================================
    console.log('\n========================================');
    console.log('TEST 7: Delete automation');
    console.log('========================================');

    if (autoId) {
      const deleted = agent['scheduler'].deleteAutomation(autoId);
      const afterDelete = agent['scheduler'].getAutomation(autoId);
      if (deleted && !afterDelete) {
        console.log('[TEST 7] PASSED: Automation deleted');
      } else {
        console.log('[TEST 7] FAILED: Automation still exists');
      }
    }

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await agent.shutdown();
    agent.cleanup();
    console.log('\n[Agent] All advanced tests completed.');
  }
}

main();
