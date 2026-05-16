import { join } from 'node:path';
import { existsSync as _fsExistsSync, readFileSync as _fsReadFileSync } from 'node:fs';
import { homedir } from 'node:os';
import type {
  SchedulerOptions,
  Logger,
  Automation,
  CreateAutomationOptions,
  Task,
  RunTaskOptions,
  ExecutionLog,
  Notification,
  Template,
  TemplateSummary,
  InstantiateTemplateOptions,
  SchedulerEventMap,
  SchedulerEventName,
  SchedulerEventHandler,
  ValidationResult,
  TaskArgs,
} from './types.js';
import { generateId, noopLogger, resolveDataDir } from './utils.js';
import { validateTask } from './security.js';
import { BUILTIN_TEMPLATES, instantiateTemplateOptions } from './templates.js';
import {
  getStorePaths, ensureStoreDirs, loadAutomations, loadTasks, loadConfig,
  saveAutomations, saveTasks, saveConfig, deleteScriptFile,
} from './store.js';
import {
  loadNotificationsState, saveNotificationsState,
  appendNotification, readNotifications, getPendingCount,
  getPendingSummary, sendHttpNotification,
} from './notifications.js';
import { executeCommand } from './executor.js';

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class Scheduler {
  private readonly paths: ReturnType<typeof getStorePaths>;
  private readonly automations: Map<string, Automation>;
  private readonly tasks: Map<string, Task>;
  private readonly templates: Template[];
  private config: Record<string, unknown>;
  private lastAck: number;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private readonly logger: Logger;
  private readonly allowedDirs: string[];
  private readonly listeners = new Map<SchedulerEventName, Set<SchedulerEventHandler<SchedulerEventName>>>();
  private running = false;
  private runningAutomations = new Set<string>();

  static create(options?: SchedulerOptions): Scheduler {
    return new Scheduler(options);
  }

  private constructor(options: SchedulerOptions = {}) {
    this.paths = getStorePaths(options.dataDir);
    this.logger = options.logger ?? noopLogger;
    this.allowedDirs = options.allowedDirs ?? [];

    ensureStoreDirs(this.paths);

    this.automations = loadAutomations(this.paths.automationsFile);
    this.tasks = loadTasks(this.paths.tasksFile);
    this.config = loadConfig(this.paths.configFile);
    this.lastAck = loadNotificationsState(this.paths.lastAckFile).lastAck;

    if (options.webhookUrl) {
      this.config.webhookUrl = options.webhookUrl;
    }
    if (options.tickIntervalMs !== undefined) {
      this.config.tickIntervalMs = options.tickIntervalMs;
    }
    // Load custom templates
    const customTemplates = this.loadCustomTemplates();
    this.templates = [...BUILTIN_TEMPLATES];
    for (const ct of customTemplates) {
      const idx = this.templates.findIndex((t) => t.id === ct.id);
      if (idx >= 0) this.templates[idx] = ct;
      else this.templates.push(ct);
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info('Scheduler started');
    this.tick();
    const intervalMs = (this.config.tickIntervalMs as number) ?? 30000;
    this.tickInterval = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.flush();
    this.logger.info('Scheduler stopped');
  }

  // ---------------------------------------------------------------------------
  // Tick Loop
  // ---------------------------------------------------------------------------

  private tick(): void {
    const now = Date.now();
    for (const a of this.automations.values()) {
      if (now >= a.nextRun && !this.runningAutomations.has(a.id)) {
        this.runningAutomations.add(a.id);
        a.nextRun = now + a.intervalMinutes * 60 * 1000;
        saveAutomations(this.paths.automationsFile, this.automations);
        this.runAutomation(a).finally(() => {
          this.runningAutomations.delete(a.id);
        }).catch((err) => {
          this.emit('error', { message: String(err), automationId: a.id });
        });
      }
    }
  }

  private async runAutomation(automation: Automation): Promise<void> {
    try {
      const result = await executeCommand(automation, this.paths.scriptsDir, 120000);
      const log: ExecutionLog = {
        time: new Date().toISOString(),
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
      automation.logs.push(log);
      if (automation.logs.length > 100) automation.logs.shift();
      saveAutomations(this.paths.automationsFile, this.automations);

      const notification: Notification = {
        type: 'automation_run',
        automationId: automation.id,
        automationName: automation.name,
        timestamp: Date.now(),
        result: log,
      };

      this.appendAndNotify(notification);
      this.emit('automation_run', {
        automationId: automation.id,
        automationName: automation.name,
        result: log,
      });
    } catch (err) {
      this.emit('error', { message: String(err), automationId: automation.id });
    }
  }

  // ---------------------------------------------------------------------------
  // Automation CRUD
  // ---------------------------------------------------------------------------

  createAutomation(options: CreateAutomationOptions): Automation {
    const args: TaskArgs = {
      command: options.command,
      script: options.script,
      scriptType: options.scriptType,
      cwd: options.cwd,
    };
    const v = validateTask(args, this.allowedDirs);
    if (!v.ok) {
      throw new Error(v.reason ?? 'Security validation failed');
    }
    if (!options.command && !options.script) {
      throw new Error('Provide either command or script');
    }

    const id = generateId();
    const automation: Automation = {
      id,
      name: options.name,
      intervalMinutes: options.intervalMinutes,
      cwd: options.cwd ?? join(homedir(), '.pi'),
      command: options.command ?? null,
      script: options.script ?? null,
      scriptType: options.scriptType ?? 'javascript',
      model: options.model ?? null,
      reasoningEffort: options.reasoningEffort ?? null,
      nextRun: Date.now(),
      logs: [],
    };

    this.automations.set(id, automation);
    saveAutomations(this.paths.automationsFile, this.automations);
    return automation;
  }

  listAutomations(): Automation[] {
    return Array.from(this.automations.values());
  }

  getAutomation(id: string): Automation | undefined {
    return this.automations.get(id);
  }

  deleteAutomation(id: string): boolean {
    const a = this.automations.get(id);
    if (!a) return false;
    if (a.script) {
      deleteScriptFile(id, a.scriptType, this.paths.scriptsDir);
    }
    this.automations.delete(id);
    saveAutomations(this.paths.automationsFile, this.automations);
    return true;
  }

  getAutomationLogs(id: string, limit?: number): ExecutionLog[] {
    const a = this.automations.get(id);
    if (!a) return [];
    const logs = a.logs.slice();
    if (limit && limit > 0) {
      return logs.slice(-limit);
    }
    return logs;
  }

  // ---------------------------------------------------------------------------
  // Task CRUD
  // ---------------------------------------------------------------------------

  runTask(options: RunTaskOptions): Task {
    const args: TaskArgs = {
      command: options.command,
      script: options.script,
      scriptType: options.scriptType,
      cwd: options.cwd,
    };
    const v = validateTask(args, this.allowedDirs);
    if (!v.ok) {
      throw new Error(v.reason ?? 'Security validation failed');
    }
    if (!options.command && !options.script) {
      throw new Error('Provide either command or script');
    }

    const id = generateId();
    const task: Task = {
      id,
      name: options.name,
      cwd: options.cwd ?? join(homedir(), '.pi'),
      command: options.command ?? null,
      script: options.script ?? null,
      scriptType: options.scriptType ?? 'javascript',
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      exitCode: null,
      stdout: '',
      stderr: '',
    };

    this.tasks.set(id, task);
    saveTasks(this.paths.tasksFile, this.tasks);

    const timeoutMs = options.timeoutMs ?? 300000;
    executeCommand(task, this.paths.scriptsDir, timeoutMs)
      .then((result) => {
        task.status = result.exitCode === 0 ? 'completed' : 'failed';
        task.completedAt = new Date().toISOString();
        task.exitCode = result.exitCode;
        task.stdout = result.stdout;
        task.stderr = result.stderr;
        saveTasks(this.paths.tasksFile, this.tasks);

        const notification: Notification = {
          type: 'task_run',
          taskId: id,
          taskName: task.name,
          timestamp: Date.now(),
          result: { status: task.status, exitCode: task.exitCode },
        };

        this.appendAndNotify(notification);
        this.emit('task_run', {
          taskId: id,
          taskName: task.name,
          result: { status: task.status, exitCode: task.exitCode },
        });
      })
      .catch((err) => {
        task.status = 'failed';
        task.completedAt = new Date().toISOString();
        task.exitCode = -1;
        task.stderr = String(err);
        saveTasks(this.paths.tasksFile, this.tasks);

        this.emit('error', { message: String(err), taskId: id });
      });

    return task;
  }

  getTaskStatus(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  listTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  deleteTask(id: string): boolean {
    const t = this.tasks.get(id);
    if (!t) return false;
    if (t.script) {
      deleteScriptFile(id, t.scriptType, this.paths.scriptsDir);
    }
    this.tasks.delete(id);
    saveTasks(this.paths.tasksFile, this.tasks);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  checkNotifications(): Notification[] {
    return readNotifications(this.paths.notificationsFile, this.lastAck);
  }

  ackNotifications(timestamp: number): void {
    this.lastAck = timestamp;
    saveNotificationsState(this.paths.lastAckFile, { lastAck: this.lastAck });
  }

  getPendingSummary(): { count: number; byAutomation: Record<string, number> } {
    return getPendingSummary(this.paths.notificationsFile, this.lastAck);
  }

  private appendAndNotify(notification: Notification): void {
    appendNotification(this.paths.notificationsFile, notification);
    this.emit('notification', notification);
    const url = this.config.webhookUrl as string | undefined;
    if (url) {
      sendHttpNotification(url, notification);
    }
  }

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  listTemplates(): TemplateSummary[] {
    return this.templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      defaultInterval: t.defaultInterval,
      scriptType: t.scriptType,
      hasCommand: !!t.command,
      hasScript: !!t.script,
    })) ;
  }

  instantiateTemplate(templateId: string, options: InstantiateTemplateOptions = {}): Automation {
    const t = this.templates.find((x) => x.id === templateId);
    if (!t) {
      throw new Error(`Template not found: ${templateId}`);
    }
    const createOpts = instantiateTemplateOptions(t, options);
    return this.createAutomation(createOpts);
  }

  registerTemplate(template: Template): void {
    const idx = this.templates.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      this.templates[idx] = template;
    } else {
      this.templates.push(template);
    }
  }

  private loadCustomTemplates(): Template[] {
    if (!_fsExistsSync(this.paths.templatesFile)) return [];
    try {
      const data = JSON.parse(_fsReadFileSync(this.paths.templatesFile, 'utf8'));
      if (Array.isArray(data)) return data as Template[];
    } catch {}
    return [];
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  setWebhookUrl(url: string): void {
    this.config.webhookUrl = url;
    saveConfig(this.paths.configFile, this.config);
  }

  // ---------------------------------------------------------------------------
  // Flush
  // ---------------------------------------------------------------------------

  flush(): void {
    saveAutomations(this.paths.automationsFile, this.automations);
    saveTasks(this.paths.tasksFile, this.tasks);
    saveConfig(this.paths.configFile, this.config);
    saveNotificationsState(this.paths.lastAckFile, { lastAck: this.lastAck });
  }

  // ---------------------------------------------------------------------------
  // Event Emitter
  // ---------------------------------------------------------------------------

  on<T extends SchedulerEventName>(event: T, handler: SchedulerEventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    (set as Set<SchedulerEventHandler<SchedulerEventName>>).add(handler as SchedulerEventHandler<SchedulerEventName>);
    return () => {
      (set as Set<SchedulerEventHandler<SchedulerEventName>>).delete(handler as SchedulerEventHandler<SchedulerEventName>);
    };
  }

  private emit<T extends SchedulerEventName>(event: T, payload: SchedulerEventMap[T]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as (p: SchedulerEventMap[T]) => void)(payload);
      } catch (err) {
        this.logger.error(`Event handler error for ${event}: ${err}`);
      }
    }
  }
}




