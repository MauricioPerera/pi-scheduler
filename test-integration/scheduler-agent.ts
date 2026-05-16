import { Scheduler } from '../packages/scheduler-core/src/scheduler.js';
import { OllamaClient } from './ollama-client.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync, mkdirSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Scheduler Agent — LLM-driven integration test
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a scheduling assistant. You help users create and manage automated tasks.

You have access to a scheduler with these capabilities:
- run_task(name, command/script, cwd): Run a one-shot background task
- create_automation(name, intervalMinutes, command/script, cwd): Create recurring automation
- list_automations(): List all automations
- check_notifications(): Check pending execution results

Security rules:
- Commands are validated against a blocklist (no rm -rf, format, etc.)
- Working directories must be under home, C:/temp, or explicit allowed dirs
- Scripts support JavaScript, Python, PowerShell

When asked to do something, respond with a JSON object specifying the action:
{
  "action": "run_task" | "create_automation",
  "name": "descriptive name",
  "command": "shell command (optional)",
  "script": "inline code (optional)",
  "scriptType": "javascript" | "python" | "powershell",
  "cwd": "working directory (MUST be under home dir, C:/temp, or allowed dir — use C:/temp if unsure)",
  "intervalMinutes": number (only for create_automation)
}

Only one of command or script should be provided.
If the user asks something ambiguous, ask for clarification.
`;

export class SchedulerAgent {
  private scheduler: Scheduler;
  private ollama: OllamaClient;
  private testDir: string;

  constructor(model: string = 'kimi-k2.6:cloud') {
    this.testDir = join(tmpdir(), `pi-scheduler-test-${Date.now()}`);
    mkdirSync(this.testDir, { recursive: true });

    this.scheduler = Scheduler.create({
      dataDir: join(this.testDir, 'data'),
      tickIntervalMs: 5000,
      allowedDirs: [this.testDir, tmpdir()],
    });

    this.ollama = new OllamaClient('http://localhost:11434', model);
  }

  async init(): Promise<void> {
    this.scheduler.start();
    console.log('[Agent] Scheduler started at:', this.testDir);
  }

  async askAndExecute(userRequest: string): Promise<void> {
    // Step 1: Ask the LLM what to do
    console.log('\n[Agent] Asking LLM...');
    console.log('[User]', userRequest);

    const response = await this.ollama.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userRequest },
      ],
    });

    const content = response.message.content;
    console.log('\n[LLM]', content);

    // Step 2: Try to extract JSON from the response
    const action = this.extractAction(content);
    if (!action) {
      console.log('[Agent] Could not parse action from LLM response.');
      return;
    }

    console.log('\n[Agent] Parsed action:', JSON.stringify(action, null, 2));

    // Step 3: Execute
    try {
      if (action.action === 'run_task') {
        const task = this.scheduler.runTask({
          name: action.name,
          command: action.command,
          script: action.script,
          scriptType: action.scriptType,
          cwd: action.cwd || this.testDir,
        });
        console.log('[Agent] Task created:', task.id, '- status:', task.status);

        // Wait for completion
        await this.waitForTask(task.id, 30000);

      } else if (action.action === 'create_automation') {
        const auto = this.scheduler.createAutomation({
          name: action.name,
          intervalMinutes: action.intervalMinutes || 60,
          command: action.command,
          script: action.script,
          scriptType: action.scriptType,
          cwd: action.cwd || this.testDir,
        });
        console.log('[Agent] Automation created:', auto.id);

      } else {
        console.log('[Agent] Unknown action:', action.action);
      }
    } catch (err) {
      console.error('[Agent] Execution error:', err instanceof Error ? err.message : String(err));
    }
  }

  async waitForTask(taskId: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const task = this.scheduler.getTaskStatus(taskId);
      if (!task) {
        console.log('[Agent] Task not found');
        return;
      }
      if (task.status !== 'running') {
        console.log(`[Agent] Task ${taskId} finished: ${task.status}`);
        console.log(`[Agent] exitCode: ${task.exitCode}`);
        if (task.stdout) console.log(`[Agent] stdout: ${task.stdout.slice(0, 500)}`);
        if (task.stderr) console.log(`[Agent] stderr: ${task.stderr.slice(0, 500)}`);
        return;
      }
      await sleep(500);
    }
    console.log('[Agent] Timeout waiting for task');
  }

  async showStatus(): Promise<void> {
    const automations = this.scheduler.listAutomations();
    const tasks = this.scheduler.listTasks();
    const notifications = this.scheduler.checkNotifications();

    console.log('\n=== Scheduler Status ===');
    console.log(`Automations: ${automations.length}`);
    for (const a of automations) {
      console.log(`  - ${a.name} (${a.intervalMinutes}min, next: ${new Date(a.nextRun).toISOString()})`);
    }
    console.log(`Tasks: ${tasks.length}`);
    for (const t of tasks) {
      console.log(`  - ${t.name}: ${t.status} (exit: ${t.exitCode})`);
    }
    console.log(`Pending notifications: ${notifications.length}`);
  }

  async shutdown(): Promise<void> {
    this.scheduler.stop();
    console.log('[Agent] Scheduler stopped');
  }

  cleanup(): void {
    if (existsSync(this.testDir)) {
      rmSync(this.testDir, { recursive: true, force: true });
      console.log('[Agent] Cleaned up:', this.testDir);
    }
  }

  private extractAction(content: string): Record<string, unknown> | null {
    // Try to find JSON in code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {}
    }

    // Try to find raw JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }

    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

