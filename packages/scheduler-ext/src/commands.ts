import type { Scheduler } from '@earendil-works/pi-scheduler-core';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

// ---------------------------------------------------------------------------
// Slash Commands
// ---------------------------------------------------------------------------

export function schedulerCommandHandler(getScheduler: () => Scheduler) {
  return async (args: string, ctx: ExtensionCommandContext) => {
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'list';

    switch (subcommand) {
      case 'list':
        await handleList(scheduler, ctx);
        break;
      case 'tasks':
        await handleTasks(scheduler, ctx);
        break;
      case 'delete':
        await handleDelete(scheduler, ctx, parts[1]);
        break;
      case 'logs':
        await handleLogs(scheduler, ctx, parts[1], parts[2] ? parseInt(parts[2], 10) : undefined);
        break;
      case 'templates':
        await handleTemplates(scheduler, ctx);
        break;
      case 'notifications':
        await handleNotifications(scheduler, ctx);
        break;
      case 'ack':
        await handleAck(scheduler, ctx);
        break;
      default:
        await ctx.ui?.notify?.(`Unknown command: /scheduler ${subcommand}`, 'warning');
    }
  };
}

async function handleList(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  const automations = getScheduler().listAutomations();
  if (automations.length === 0) {
    await ctx.ui?.notify?.('No automations scheduled', 'info');
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

  await ctx.ui?.notify?.(lines.join('\n'), 'info');
}

async function handleTasks(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  const tasks = getScheduler().listTasks().reverse();
  if (tasks.length === 0) {
    await ctx.ui?.notify?.('No one-shot tasks', 'info');
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

  await ctx.ui?.notify?.(lines.join('\n'), 'info');
}

async function handleDelete(scheduler: Scheduler, ctx: ExtensionCommandContext, id?: string): Promise<void> {
  if (!id) {
    await ctx.ui?.notify?.('Usage: /scheduler delete <id>', 'warning');
    return;
  }

  const confirmed = await ctx.ui?.confirm?.('Delete automation/task', `Delete ${id}?`, { timeout: 10000 });
  if (!confirmed) {
    await ctx.ui?.notify?.('Cancelled', 'info');
    return;
  }

  const deleted = getScheduler().deleteAutomation(id) || getScheduler().deleteTask(id);
  await ctx.ui?.notify?.(deleted ? `Deleted ${id}` : `Not found: ${id}`, deleted ? 'info' : 'warning');
}

async function handleLogs(
  scheduler: Scheduler,
  ctx: ExtensionCommandContext,
  id?: string,
  limit?: number
): Promise<void> {
  if (!id) {
    await ctx.ui?.notify?.('Usage: /scheduler logs <id> [limit]', 'warning');
    return;
  }

  const logs = getScheduler().getAutomationLogs(id, limit ?? 10);
  if (logs.length === 0) {
    await ctx.ui?.notify?.('No logs found', 'info');
    return;
  }

  const lines: string[] = [];
  for (const log of logs) {
    lines.push(`[${log.time}] exit=${log.exitCode}`);
    if (log.stdout) lines.push(`stdout: ${log.stdout.slice(0, 200)}`);
    if (log.stderr) lines.push(`stderr: ${log.stderr.slice(0, 200)}`);
    lines.push('');
  }

  await ctx.ui?.notify?.(lines.join('\n'), 'info');
}

async function handleTemplates(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  const templates = getScheduler().listTemplates();
  const lines = templates.map((t) => `${t.id}: ${t.description} (default: ${t.defaultInterval}min)`);
  await ctx.ui?.notify?.(lines.join('\n') || 'No templates', 'info');
}

async function handleNotifications(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  const summary = getScheduler().getPendingSummary();
  if (summary.count === 0) {
    await ctx.ui?.notify?.('No pending notifications', 'info');
    return;
  }

  const lines = [`${summary.count} pending notifications:`];
  for (const [name, count] of Object.entries(summary.byAutomation)) {
    lines.push(`  ${name}: ${count}`);
  }
  await ctx.ui?.notify?.(lines.join('\n'), 'info');
}

async function handleAck(scheduler: Scheduler, ctx: ExtensionCommandContext): Promise<void> {
  getScheduler().ackNotifications(Date.now());
  await ctx.ui?.notify?.('All notifications acknowledged', 'info');
}

