import { Type, type Static } from 'typebox';
import type {
  Scheduler,
  CreateAutomationOptions,
  RunTaskOptions,
  InstantiateTemplateOptions,
} from '@earendil-works/pi-scheduler-core';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ScriptType = Type.Union([
  Type.Literal('javascript'),
  Type.Literal('python'),
  Type.Literal('powershell'),
]);

// ---------------------------------------------------------------------------
// create_automation
// ---------------------------------------------------------------------------

const CreateAutomationParams = Type.Object({
  name: Type.String({ description: 'Automation name' }),
  intervalMinutes: Type.Number({ description: 'Interval in minutes' }),
  cwd: Type.Optional(Type.String({ description: 'Working directory' })),
  command: Type.Optional(Type.String({ description: 'Shell command' })),
  script: Type.Optional(Type.String({ description: 'Inline script' })),
  scriptType: Type.Optional(ScriptType),
  model: Type.Optional(Type.String()),
  reasoningEffort: Type.Optional(Type.String()),
});

export function createAutomationTool(getScheduler: () => Scheduler) {
  return {
    name: 'create_automation',
    label: 'Create recurring automation',
    description: 'Create a recurring automation that runs a command or script on a schedule.',
    parameters: CreateAutomationParams,
    async execute(toolCallId, params) {
      const options: CreateAutomationOptions = {
        name: params.name,
        intervalMinutes: params.intervalMinutes,
        cwd: params.cwd,
        command: params.command,
        script: params.script,
        scriptType: params.scriptType,
        model: params.model,
        reasoningEffort: params.reasoningEffort,
      };
      const automation = getScheduler().createAutomation(options);
      return {
        content: [{ type: 'text', text: `Created automation ${automation.id}` }],
        details: automation,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// list_automations
// ---------------------------------------------------------------------------

const ListAutomationsParams = Type.Object({});

export function listAutomationsTool(getScheduler: () => Scheduler) {
  return {
    name: 'list_automations',
    label: 'List automations',
    description: 'List all recurring automations with last log and next run time.',
    parameters: ListAutomationsParams,
    async execute(toolCallId) {
      const list = getScheduler().listAutomations().map((a) => ({
        id: a.id,
        name: a.name,
        intervalMinutes: a.intervalMinutes,
        nextRun: new Date(a.nextRun).toISOString(),
        lastLog: a.logs.length > 0 ? a.logs[a.logs.length - 1] : null,
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
        details: list,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// delete_automation
// ---------------------------------------------------------------------------

const DeleteAutomationParams = Type.Object({
  id: Type.String({ description: 'Automation ID' }),
});

export function deleteAutomationTool(getScheduler: () => Scheduler) {
  return {
    name: 'delete_automation',
    label: 'Delete automation',
    description: 'Remove an automation and its script file.',
    parameters: DeleteAutomationParams,
    async execute(toolCallId, params) {
      const deleted = getScheduler().deleteAutomation(params.id);
      return {
        content: [{ type: 'text', text: deleted ? 'Deleted' : 'Not found' }],
        details: { deleted },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// get_automation_logs
// ---------------------------------------------------------------------------

const GetAutomationLogsParams = Type.Object({
  id: Type.String({ description: 'Automation ID' }),
  limit: Type.Optional(Type.Number({ description: 'Max logs to return' })),
});

export function getAutomationLogsTool(getScheduler: () => Scheduler) {
  return {
    name: 'get_automation_logs',
    label: 'Get automation logs',
    description: 'Get recent run logs for an automation.',
    parameters: GetAutomationLogsParams,
    async execute(toolCallId, params) {
      const logs = getScheduler().getAutomationLogs(params.id, params.limit);
      return {
        content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }],
        details: logs,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// list_templates
// ---------------------------------------------------------------------------

const ListTemplatesParams = Type.Object({});

export function listTemplatesTool(getScheduler: () => Scheduler) {
  return {
    name: 'list_templates',
    label: 'List templates',
    description: 'List available automation templates that can be instantiated.',
    parameters: ListTemplatesParams,
    async execute(toolCallId) {
      const items = getScheduler().listTemplates();
      return {
        content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
        details: items,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// instantiate_template
// ---------------------------------------------------------------------------

const InstantiateTemplateParams = Type.Object({
  templateId: Type.String({ description: 'Template ID from list_templates' }),
  name: Type.Optional(Type.String({ description: 'Automation name (default: template name)' })),
  intervalMinutes: Type.Optional(Type.Number({ description: 'Interval in minutes (default: template defaultInterval)' })),
  cwd: Type.Optional(Type.String({ description: 'Working directory' })),
  params: Type.Optional(Type.String({ description: 'JSON string with parameter map for ${key} interpolation' })),
});

export function instantiateTemplateTool(getScheduler: () => Scheduler) {
  return {
    name: 'instantiate_template',
    label: 'Instantiate template',
    description: 'Create an automation from a pre-defined template. Override interval, cwd, or pass params for interpolation.',
    parameters: InstantiateTemplateParams,
    async execute(toolCallId, params) {
      let parsedParams: Record<string, string> = {};
      if (params.params) {
        try {
          parsedParams = JSON.parse(params.params);
        } catch (e) {
          return {
            content: [{ type: 'text', text: `Invalid JSON in params: ${e instanceof Error ? e.message : String(e)}` }],
            details: {},
          };
        }
      }
      const options: InstantiateTemplateOptions = {
        name: params.name,
        intervalMinutes: params.intervalMinutes,
        cwd: params.cwd,
        params: parsedParams,
      };
      const automation = getScheduler().instantiateTemplate(params.templateId, options);
      return {
        content: [{ type: 'text', text: `Created automation ${automation.id} from template ${params.templateId}` }],
        details: automation,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// run_task
// ---------------------------------------------------------------------------

const RunTaskParams = Type.Object({
  name: Type.String({ description: 'Task name' }),
  cwd: Type.Optional(Type.String({ description: 'Working directory' })),
  command: Type.Optional(Type.String({ description: 'Shell command' })),
  script: Type.Optional(Type.String({ description: 'Inline script' })),
  scriptType: Type.Optional(ScriptType),
  timeoutMs: Type.Optional(Type.Number({ description: 'Timeout in milliseconds (default: 300000 = 5 min)' })),
});

export function runTaskTool(getScheduler: () => Scheduler) {
  return {
    name: 'run_task',
    label: 'Run one-shot task',
    description: 'Run a one-shot background task and return a taskId immediately. Check status later with get_task_status.',
    parameters: RunTaskParams,
    async execute(toolCallId, params) {
      const options: RunTaskOptions = {
        name: params.name,
        cwd: params.cwd,
        command: params.command,
        script: params.script,
        scriptType: params.scriptType,
        timeoutMs: params.timeoutMs,
      };
      const task = getScheduler().runTask(options);
      return {
        content: [{ type: 'text', text: `Task ${task.id} started. Use get_task_status with id=${task.id} to check progress.` }],
        details: task,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// get_task_status
// ---------------------------------------------------------------------------

const GetTaskStatusParams = Type.Object({
  id: Type.String({ description: 'Task ID' }),
});

export function getTaskStatusTool(getScheduler: () => Scheduler) {
  return {
    name: 'get_task_status',
    label: 'Get task status',
    description: 'Get the current status and output of a one-shot task.',
    parameters: GetTaskStatusParams,
    async execute(toolCallId, params) {
      const task = getScheduler().getTaskStatus(params.id);
      if (!task) {
        return {
          content: [{ type: 'text', text: `Task not found: ${params.id}` }],
          details: null,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
        details: task,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// list_tasks
// ---------------------------------------------------------------------------

const ListTasksParams = Type.Object({});

export function listTasksTool(getScheduler: () => Scheduler) {
  return {
    name: 'list_tasks',
    label: 'List tasks',
    description: 'List all one-shot tasks ordered by most recent.',
    parameters: ListTasksParams,
    async execute(toolCallId) {
      const list = getScheduler().listTasks().reverse().map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        exitCode: t.exitCode,
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
        details: list,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// delete_task
// ---------------------------------------------------------------------------

const DeleteTaskParams = Type.Object({
  id: Type.String({ description: 'Task ID' }),
});

export function deleteTaskTool(getScheduler: () => Scheduler) {
  return {
    name: 'delete_task',
    label: 'Delete task',
    description: 'Remove a one-shot task and its script file.',
    parameters: DeleteTaskParams,
    async execute(toolCallId, params) {
      const deleted = getScheduler().deleteTask(params.id);
      return {
        content: [{ type: 'text', text: deleted ? 'Deleted' : 'Not found' }],
        details: { deleted },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// check_notifications
// ---------------------------------------------------------------------------

const CheckNotificationsParams = Type.Object({});

export function checkNotificationsTool(getScheduler: () => Scheduler) {
  return {
    name: 'check_notifications',
    label: 'Check notifications',
    description: 'Check pending scheduler notifications since last ack.',
    parameters: CheckNotificationsParams,
    async execute(toolCallId) {
      const notifications = getScheduler().checkNotifications();
      return {
        content: [{ type: 'text', text: JSON.stringify(notifications, null, 2) }],
        details: { count: notifications.length, notifications },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// ack_notifications
// ---------------------------------------------------------------------------

const AckNotificationsParams = Type.Object({
  timestamp: Type.Number({ description: 'Acknowledge all notifications up to this timestamp' }),
});

export function ackNotificationsTool(getScheduler: () => Scheduler) {
  return {
    name: 'ack_notifications',
    label: 'Ack notifications',
    description: 'Mark all scheduler notifications up to a timestamp as read.',
    parameters: AckNotificationsParams,
    async execute(toolCallId, params) {
      getScheduler().ackNotifications(params.timestamp);
      return {
        content: [{ type: 'text', text: 'Notifications acknowledged' }],
        details: { timestamp: params.timestamp },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// get_pending_summary
// ---------------------------------------------------------------------------

const GetPendingSummaryParams = Type.Object({});

export function getPendingSummaryTool(getScheduler: () => Scheduler) {
  return {
    name: 'get_pending_summary',
    label: 'Pending summary',
    description: 'Summary of pending scheduler notifications grouped by automation.',
    parameters: GetPendingSummaryParams,
    async execute(toolCallId) {
      const summary = getScheduler().getPendingSummary();
      return {
        content: [{ type: 'text', text: `${summary.count} pending. ${JSON.stringify(summary.byAutomation, null, 2)}` }],
        details: summary,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// set_webhook
// ---------------------------------------------------------------------------

const SetWebhookParams = Type.Object({
  url: Type.String({ description: 'Webhook URL for notifications' }),
});

export function setWebhookTool(getScheduler: () => Scheduler) {
  return {
    name: 'set_webhook',
    label: 'Set webhook',
    description: 'Set a webhook URL for scheduler notifications.',
    parameters: SetWebhookParams,
    async execute(toolCallId, params) {
      getScheduler().setWebhookUrl(params.url);
      return {
        content: [{ type: 'text', text: `Webhook set to ${params.url}` }],
        details: { url: params.url },
      };
    },
  };
}

