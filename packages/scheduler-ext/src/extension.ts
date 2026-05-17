import { join } from 'node:path';
import { homedir } from 'node:os';
import { Scheduler } from 'pi-scheduler-core';
import type { ExtensionFactory, ExtensionContext, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { createSubagentExecutor } from './subagent-executor.js';
import {
  createAutomationTool,
  listAutomationsTool,
  deleteAutomationTool,
  getAutomationLogsTool,
  listTemplatesTool,
  instantiateTemplateTool,
  runTaskTool,
  getTaskStatusTool,
  listTasksTool,
  deleteTaskTool,
  checkNotificationsTool,
  ackNotificationsTool,
  getPendingSummaryTool,
  setWebhookTool,
  createSubagentAutomationTool,
} from './tools.js';
import { schedulerCommandHandler } from './commands.js';
import { loadSkillTemplates, parsedTemplateToCoreTemplate } from './skill-loader.js';

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export const schedulerExtension: ExtensionFactory = async (api) => {
  let scheduler: Scheduler | undefined;
  let cleanupFns: Array<() => void> = [];

  const getScheduler = (): Scheduler => {
    if (!scheduler) {
      throw new Error('Scheduler not initialized. Wait for session_start.');
    }
    return scheduler;
  };

  // Register tools
  api.registerTool(createAutomationTool(getScheduler));
  api.registerTool(listAutomationsTool(getScheduler));
  api.registerTool(deleteAutomationTool(getScheduler));
  api.registerTool(getAutomationLogsTool(getScheduler));
  api.registerTool(listTemplatesTool(getScheduler));
  api.registerTool(instantiateTemplateTool(getScheduler));
  api.registerTool(runTaskTool(getScheduler));
  api.registerTool(getTaskStatusTool(getScheduler));
  api.registerTool(listTasksTool(getScheduler));
  api.registerTool(deleteTaskTool(getScheduler));
  api.registerTool(checkNotificationsTool(getScheduler));
  api.registerTool(ackNotificationsTool(getScheduler));
  api.registerTool(getPendingSummaryTool(getScheduler));
  api.registerTool(setWebhookTool(getScheduler));
  api.registerTool(createSubagentAutomationTool(getScheduler));

  // Register slash command
  api.registerCommand('/scheduler', {
    description: 'Manage scheduled automations and tasks',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await schedulerCommandHandler(getScheduler)(args, ctx);
    },
  });

  // Event: session_start
  api.on('session_start', async (_event, ctx: ExtensionContext) => {
    const dataDir = join(ctx.cwd, '.pi', 'scheduler');
    const envDirs = process.env.SCHEDULER_ALLOWED_DIRS
      ? process.env.SCHEDULER_ALLOWED_DIRS.split(';').filter(Boolean)
      : [];
    const allowedDirs = [ctx.cwd, join(homedir(), 'repos'), ...envDirs];

    scheduler = Scheduler.create({
      dataDir,
      allowedDirs,
      subagentExecutor: createSubagentExecutor(),
      logger: {
        info: (m) => console.log(`[scheduler] ${m}`),
        warn: (m) => console.warn(`[scheduler] ${m}`),
        error: (m) => console.error(`[scheduler] ${m}`),
      },
    });

    // Load custom templates from skills
    const skillTemplates = loadSkillTemplates(
      join(ctx.cwd, '.pi', 'agent', 'skills', 'scheduler-templates')
    );
    for (const parsed of skillTemplates) {
      scheduler.registerTemplate(parsedTemplateToCoreTemplate(parsed));
    }

    scheduler.start();

    // Check pending notifications
    const pending = scheduler.getPendingSummary();
    if (pending.count > 0 && ctx.hasUI) {
      ctx.ui.notify(`${pending.count} pending scheduler notification(s)`, 'info');
    }

    // Wire scheduler events -> UI
    const onAuto = scheduler.on('automation_run', (event) => {
      const status = event.result.exitCode === 0 ? 'completed' : 'failed';
      if (ctx.hasUI) {
        ctx.ui.notify(`Automation "${event.automationName}" ${status}`, status === 'failed' ? 'warning' : 'info');
      }
    });

    const onTask = scheduler.on('task_run', (event) => {
      const status = event.result.status;
      if (ctx.hasUI) {
        ctx.ui.notify(`Task "${event.taskName}" ${status}`, status === 'failed' ? 'warning' : 'info');
      }
    });

    const onErr = scheduler.on('error', (event) => {
      if (ctx.hasUI) {
        ctx.ui.notify(`Scheduler error: ${event.message}`, 'error');
      }
    });

    cleanupFns.push(onAuto, onTask, onErr);
  });

  // Event: session_shutdown
  api.on('session_shutdown', async () => {
    for (const fn of cleanupFns) fn();
    cleanupFns = [];
    if (scheduler) {
      scheduler.stop();
      scheduler = undefined;
    }
  });
};

