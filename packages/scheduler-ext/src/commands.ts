import type { Scheduler } from 'pi-scheduler-core';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

async function notify(
  ctx: ExtensionCommandContext,
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
): Promise<void> {
  if (ctx.ui?.notify) {
    await ctx.ui.notify(message, level);
  } else {
    console.log(`[scheduler/${level}] ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Slash Commands
// ---------------------------------------------------------------------------

export function schedulerCommandHandler(getScheduler: () => Scheduler) {
  return async (args: string, ctx: ExtensionCommandContext) => {
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'list';

    switch (subcommand) {
      case 'list':
        await handleList(getScheduler(), ctx);
        break;
      case 'tasks':
        await handleTasks(getScheduler(), ctx);
        break;
      case 'delete':
        await handleDelete(getScheduler(), ctx, parts[1]);
        break;
      case 'logs':
        await handleLogs(getScheduler(), ctx, parts[1], parts[2] ? parseInt(parts[2], 10) : undefined);
        break;
      case 'templates':
        await handleTemplates(getScheduler(), ctx);
        break;
      case 'notifications':
        await handleNotifications(getScheduler(), ctx);
        break;
      case 'ack':
        await handleAck(getScheduler(), ctx);
        break;
      default:
        await notify(ctx, `Unknown command: /scheduler ${subcommand}`, 'warning');
    }
  };
}

async function handleList(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  const automations = scheduler.listAutomations();
  if (automations.length === 0) {
    await notify(ctx, 'No automations scheduled');
    return;
  }

  const lines = ['Name          | Interval | Next Run         | Last Status'];
  lines.push('--------------|----------|------------------|------------');

  for (const a of automations) {
    const nextIn = Math.max(0, a.nextRun - Date.now());
    const nextStr = nextIn < 60000 ? `${Math.round(nextIn / 1000)}s` : `${Math.round(nextIn / 60000)}m`;
    const lastLog = a.logs.length > 0 ? a.logs[a.logs.length - 1] : null;
    const lastStatus = lastLog ? (lastLog.exitCode === 0 ? 'success' : `fail(${lastLog.exitCode})`) : 'none';
    lines.push(`${a.name.padEnd(14)}| ${String(a.intervalMinutes).padEnd(9)}| in ${nextStr.padEnd(13)}| ${lastStatus}`);
  }

  await notify(ctx, lines.join('\n'));
}

async function handleTasks(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  const tasks = scheduler.listTasks().reverse();
  if (tasks.length === 0) {
    await notify(ctx, 'No one-shot tasks');
    return;
  }

  const lines = ['Name          | Status    | Started           | Exit'];
  lines.push('--------------|-----------|-------------------|------');

  for (const t of tasks) {
    const status = t.status.padEnd(9);
    const started = t.startedAt.slice(0, 19).replace('T', ' ');
    const exit = t.exitCode !== null ? String(t.exitCode) : '-';
    lines.push(`${t.name.padEnd(14)}| ${status}| ${started} | ${exit}`);
  }

  await notify(ctx, lines.join('\n'));
}

async function handleDelete(scheduler: Scheduler, ctx: ExtensionCommandContext, id?: string): Promise<void> {
  if (!id) {
    await notify(ctx, 'Usage: /scheduler delete <id>', 'warning');
    return;
  }

  const confirmed = await ctx.ui?.confirm?.('Delete automation/task', `Delete ${id}?`, { timeout: 10000 });
  if (!confirmed) {
    await notify(ctx, 'Cancelled');
    return;
  }

  const deleted = scheduler.deleteAutomation(id) || scheduler.deleteTask(id);
  await notify(ctx, deleted ? `Deleted ${id}` : `Not found: ${id}`, deleted ? 'info' : 'warning');
}

async function handleLogs(
  scheduler: Scheduler,
  ctx: ExtensionCommandContext,
  id?: string,
  limit?: number
): Promise<void> {
  if (!id) {
    await notify(ctx, 'Usage: /scheduler logs <id> [limit]', 'warning');
    return;
  }

  const logs = scheduler.getAutomationLogs(id, limit ?? 10);
  if (logs.length === 0) {
    await notify(ctx, 'No logs found');
    return;
  }

  const lines: string[] = [];
  for (const log of logs) {
    lines.push(`[${log.time}] exit=${log.exitCode}`);
    if (log.stdout) lines.push(`stdout: ${log.stdout.slice(0, 200)}`);
    if (log.stderr) lines.push(`stderr: ${log.stderr.slice(0, 200)}`);
    lines.push('');
  }

  await notify(ctx, lines.join('\n'));
}

async function handleTemplates(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  const templates = scheduler.listTemplates();
  const lines = templates.map((t) => `${t.id}: ${t.description} (default: ${t.defaultInterval}min)`);
  await notify(ctx, lines.join('\n') || 'No templates');
}

async function handleNotifications(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  const summary = scheduler.getPendingSummary();
  if (summary.count === 0) {
    await notify(ctx, 'No pending notifications');
    return;
  }

  const lines = [`${summary.count} pending notifications:`];
  for (const [name, count] of Object.entries(summary.byAutomation)) {
    lines.push(`  ${name}: ${count}`);
  }
  await notify(ctx, lines.join('\n'));
}

async function handleAck(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  scheduler.ackNotifications(Date.now());
  await notify(ctx, 'All notifications acknowledged');
}

