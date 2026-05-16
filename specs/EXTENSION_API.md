# API de la Extension (scheduler-ext)

## Proposito

La extension es la capa de integracion entre scheduler-core y pi-coding-agent. Expone:
- **Tools**: create_automation, un_task, list_automations, etc.
- **Comandos slash**: /scheduler list, /scheduler delete, /scheduler logs
- **Event handlers**: session_start, session_shutdown, fter_provider_response
- **Notificaciones UI**: Banners, badges, y mensajes de sistema en la TUI

## ExtensionFactory

`	ypescript
import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { Scheduler } from '@earendil-works/pi-scheduler-core';

export const schedulerExtension: ExtensionFactory = (ctx) => {
  const scheduler = Scheduler.create({
    dataDir: join(ctx.agentDir, 'scheduler'),
    allowedDirs: [ctx.cwd, join(homedir(), 'repos')],
  });

  // Registrar tools
  ctx.registerTool(createAutomationTool(scheduler));
  ctx.registerTool(runTaskTool(scheduler));
  ctx.registerTool(listAutomationsTool(scheduler));
  ctx.registerTool(deleteAutomationTool(scheduler));
  ctx.registerTool(getAutomationLogsTool(scheduler));
  ctx.registerTool(listTemplatesTool(scheduler));
  ctx.registerTool(instantiateTemplateTool(scheduler));
  ctx.registerTool(runTaskTool(scheduler));
  ctx.registerTool(getTaskStatusTool(scheduler));
  ctx.registerTool(listTasksTool(scheduler));
  ctx.registerTool(deleteTaskTool(scheduler));
  ctx.registerTool(checkNotificationsTool(scheduler));
  ctx.registerTool(ackNotificationsTool(scheduler));
  ctx.registerTool(setWebhookTool(scheduler));

  // Registrar comandos slash
  ctx.registerCommand({
    name: '/scheduler',
    description: 'Manage scheduled automations and tasks',
    handler: async (args, ctx) => {
      // /scheduler list
      // /scheduler delete <id>
      // /scheduler logs <id>
      // /scheduler templates
      // /scheduler notifications
    },
  });

  // Event handlers
  ctx.on('session_start', async () => {
    scheduler.start();
    const pending = scheduler.getPendingSummary();
    if (pending.count > 0) {
      ctx.ui.notify(${pending.count} pending scheduler notification(s), 'info');
    }
  });

  ctx.on('session_shutdown', async () => {
    scheduler.stop();
  });

  // Notificaciones del scheduler -> UI
  scheduler.on('automation_run', (event) => {
    const status = event.result.exitCode === 0 ? 'completed' : 'failed';
    ctx.ui.notify(
      Automation "" ,
      status === 'failed' ? 'warning' : 'info'
    );
  });

  scheduler.on('task_run', (event) => {
    const status = event.result.status;
    ctx.ui.notify(
      Task "" ,
      status === 'failed' ? 'warning' : 'info'
    );
  });

  // Cargar templates como skills de pi
  const skillTemplates = loadSkillTemplates(ctx);
  for (const template of skillTemplates) {
    scheduler.registerTemplate(template);
  }
};
`

## Tools

### create_automation

`	ypescript
const createAutomationTool = (scheduler: Scheduler): AgentTool => ({
  name: 'create_automation',
  label: 'Create recurring automation',
  description: 'Create a recurring automation that runs a command or script on a schedule.',
  parameters: Type.Object({
    name: Type.String({ description: 'Automation name' }),
    intervalMinutes: Type.Number({ description: 'Interval in minutes' }),
    cwd: Type.Optional(Type.String({ description: 'Working directory' })),
    command: Type.Optional(Type.String({ description: 'Shell command' })),
    script: Type.Optional(Type.String({ description: 'Inline script' })),
    scriptType: Type.Optional(Type.Enum(['javascript', 'python', 'powershell'])),
  }),
  async execute(toolCallId, params, signal) {
    const automation = scheduler.createAutomation(params);
    return {
      content: [{ type: 'text', text: Created automation  }],
      details: automation,
    };
  },
});
`

### run_task

`	ypescript
const runTaskTool = (scheduler: Scheduler): AgentTool => ({
  name: 'run_task',
  label: 'Run one-shot task',
  description: 'Run a one-shot background task and return a taskId.',
  parameters: Type.Object({
    name: Type.String(),
    cwd: Type.Optional(Type.String()),
    command: Type.Optional(Type.String()),
    script: Type.Optional(Type.String()),
    scriptType: Type.Optional(Type.Enum(['javascript', 'python', 'powershell'])),
    timeoutMs: Type.Optional(Type.Number()),
  }),
  async execute(toolCallId, params, signal) {
    const task = scheduler.runTask(params);
    return {
      content: [{ type: 'text', text: Task  started. }],
      details: task,
    };
  },
});
`

### check_notifications

`	ypescript
const checkNotificationsTool = (scheduler: Scheduler): AgentTool => ({
  name: 'check_notifications',
  label: 'Check pending notifications',
  description: 'Check pending scheduler notifications since last ack.',
  parameters: Type.Object({}),
  async execute(toolCallId, params, signal) {
    const notifications = scheduler.checkNotifications();
    return {
      content: [{ type: 'text', text: JSON.stringify(notifications, null, 2) }],
      details: { count: notifications.length, notifications },
    };
  },
});
`

## Comandos Slash

### /scheduler list

Muestra tabla de automations con estado:
`
Name          | Interval | Next Run      | Last Status
--------------|----------|---------------|------------
Build MyProj  | 60 min   | in 23 min     | success
Disk Check    | 5 min    | in 2 min      | success
`

### /scheduler delete <id>

Elimina automation o task. Pide confirmacion.

### /scheduler logs <id> [limit]

Muestra logs recientes de una automation.

### /scheduler notifications

Muestra resumen de notificaciones pendientes con opcion de ack.

### /scheduler templates

Lista templates disponibles con descripcion.

## Carga de Templates desde Skills

Los templates se definen en skills de pi bajo ~/.pi/agent/skills/scheduler-templates/SKILL.md:

`markdown
---
name: scheduler-templates
description: Templates predefinidos para automatizaciones recurrentes
---

## build-project

- **Comando**: dotnet build
- **Intervalo**: 60 min
- **Params**: epoPath (opcional)

## disk-check

- **Comando**: Get-PSDrive C | Select-Object Used,Free
- **Intervalo**: 5 min

## git-sync

- **Comando**: git pull
- **Intervalo**: 30 min
- **Params**: epoPath (opcional)
`

La extension parsea este markdown en tiempo de carga y registra cada template en el scheduler core.

## Integracion con el Ciclo de Vida de pi

### Session Start

Cuando pi inicia una sesion:
1. La extension crea el Scheduler.
2. Llama scheduler.start().
3. Chequea notificaciones pendientes.
4. Muestra badge o banner si hay notificaciones nuevas.

### Session Shutdown

Cuando pi cierra la sesion:
1. session_shutdown event.
2. La extension llama scheduler.stop().
3. El scheduler hace lush() de estado.
4. Si el proceso de Node muere, las automations NO siguen corriendo (a menos que haya un daemon companion).

### Context Switch / Session Replacement

Si el usuario hace /new o /switch en pi:
- El ExtensionContext se invalida.
- La extension debe guardar el estado del scheduler antes de que el contexto muera.
- El nuevo contexto recrea el scheduler desde el mismo dataDir.

## Notificaciones en la TUI

Las notificaciones del scheduler se mapean a ExtensionUIContext.notify():

`	ypescript
scheduler.on('automation_run', (event) => {
  const icon = event.result.exitCode === 0 ? '\u2713' : '\u2717';
  ctx.ui.notify(
    ${icon} Automation "" exited with code ,
    event.result.exitCode === 0 ? 'info' : 'warning'
  );
});
`

En modo interactivo, esto aparece como un banner temporal. En modo print/RPC, se loggea.

## Dependencias Peer

`json
{
  "peerDependencies": {
    "@earendil-works/pi-agent-core": "^0.74.0",
    "@earendil-works/pi-coding-agent": "^0.74.0"
  }
}
`

La extension NO debe importar estaticamente modulos de pi en el top-level si se carga dinamicamente. Usar lazy imports o type-only imports.
