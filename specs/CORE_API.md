# API Publica de scheduler-core

## Entry Point

`	ypescript
import { Scheduler } from '@earendil-works/pi-scheduler-core';
`

## Scheduler.create(options)

Crea una instancia del scheduler. No inicia el tick loop automaticamente.

`	ypescript
interface SchedulerOptions {
  /** Directorio de datos. Default: ~/.pi/scheduler */
  dataDir?: string;
  /** Intervalo del tick loop en ms. Default: 30000 */
  tickIntervalMs?: number;
  /** Webhook URL para notificaciones. */
  webhookUrl?: string;
  /** Directorios adicionales permitidos como cwd. */
  allowedDirs?: string[];
  /** Logger opcional. */
  logger?: Logger;
}

interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const scheduler = Scheduler.create({
  dataDir: '~/.pi/scheduler',
  tickIntervalMs: 30000,
  allowedDirs: ['D:/repos', 'C:/temp'],
});
`

## Metodos del Scheduler

### start()

Inicia el tick loop. Carga estado de disco, ejecuta tick inmediato.

`	ypescript
scheduler.start();
`

### stop()

Detiene el tick loop. Hace lush() del estado.

`	ypescript
scheduler.stop();
`

### createAutomation(options)

Crea una automation recurrente.

`	ypescript
interface CreateAutomationOptions {
  name: string;
  intervalMinutes: number;
  cwd?: string;
  command?: string;      // Shell command (mutuamente excluyente con script)
  script?: string;       // Inline code
  scriptType?: 'javascript' | 'python' | 'powershell';
  model?: string;         // Modelo opcional para ejecucion con LLM
  reasoningEffort?: string;
}

const automation = scheduler.createAutomation({
  name: 'Build MyProject',
  intervalMinutes: 60,
  cwd: 'D:/repos/myproject',
  command: 'dotnet build',
});
// Returns: Automation { id, name, intervalMinutes, nextRun, ... }
`

### listAutomations()

Lista todas las automations con metadata.

`	ypescript
const automations = scheduler.listAutomations();
// Returns: Automation[]
`

### getAutomation(id)

Obtiene una automation por ID.

`	ypescript
const auto = scheduler.getAutomation('abc123');
`

### deleteAutomation(id)

Elimina una automation y sus archivos de script.

`	ypescript
const deleted = scheduler.deleteAutomation('abc123');
// Returns: boolean
`

### getAutomationLogs(id, limit?)

Obtiene logs recientes de una automation.

`	ypescript
const logs = scheduler.getAutomationLogs('abc123', 10);
// Returns: ExecutionLog[]
`

### runTask(options)

Ejecuta un task one-shot y retorna inmediatamente.

`	ypescript
interface RunTaskOptions {
  name: string;
  cwd?: string;
  command?: string;
  script?: string;
  scriptType?: 'javascript' | 'python' | 'powershell';
  timeoutMs?: number;    // Default: 300000 (5 min)
}

const task = scheduler.runTask({
  name: 'Long test run',
  command: 'npm test',
  timeoutMs: 600000,
});
// Returns: Task { id, name, status: 'running', startedAt, ... }
`

### getTaskStatus(id)

Obtiene el estado actual de un task.

`	ypescript
const status = scheduler.getTaskStatus('task-abc');
// Returns: Task | null
`

### listTasks()

Lista todos los tasks.

`	ypescript
const tasks = scheduler.listTasks();
// Returns: TaskSummary[]
`

### deleteTask(id)

Elimina un task.

`	ypescript
const deleted = scheduler.deleteTask('task-abc');
`

### checkNotifications()

Chequea notificaciones pendientes desde el ultimo ack.

`	ypescript
const notifications = scheduler.checkNotifications();
// Returns: Notification[]
`

### ackNotifications(timestamp)

Marca todas las notificaciones hasta un timestamp como leidas.

`	ypescript
scheduler.ackNotifications(Date.now());
`

### getPendingSummary()

Resumen de notificaciones pendientes agrupadas por automation.

`	ypescript
const summary = scheduler.getPendingSummary();
// Returns: { count: number, byAutomation: Record<string, number> }
`

### listTemplates()

Lista templates disponibles.

`	ypescript
const templates = scheduler.listTemplates();
// Returns: Template[]
`

### instantiateTemplate(templateId, options)

Crea una automation desde un template.

`	ypescript
interface InstantiateTemplateOptions {
  name?: string;
  intervalMinutes?: number;
  cwd?: string;
  params?: Record<string, string>;   // Interpolacion 
}

const automation = scheduler.instantiateTemplate('build-project', {
  name: 'Build MyProject',
  cwd: 'D:/repos/myproject',
  params: { repoPath: 'D:/repos/myproject' },
});
`

## Eventos

El scheduler emite eventos que la extension puede escuchar.

`	ypescript
interface SchedulerEventMap {
  'automation_run': { automationId: string; automationName: string; result: ExecutionLog };
  'task_run': { taskId: string; taskName: string; result: TaskResult };
  'notification': Notification;
  'error': { message: string; automationId?: string; taskId?: string };
}

scheduler.on('automation_run', (event) => {
  console.log(Automation  finished with exit code );
});
`

## Tipos de Datos

### Automation

`	ypescript
interface Automation {
  id: string;
  name: string;
  intervalMinutes: number;
  cwd: string;
  command: string | null;
  script: string | null;
  scriptType: 'javascript' | 'python' | 'powershell';
  model: string | null;
  reasoningEffort: string | null;
  nextRun: number;          // Timestamp
  logs: ExecutionLog[];
}
`

### Task

`	ypescript
interface Task {
  id: string;
  name: string;
  cwd: string;
  command: string | null;
  script: string | null;
  scriptType: 'javascript' | 'python' | 'powershell';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;        // ISO 8601
  completedAt: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}
`

### ExecutionLog

`	ypescript
interface ExecutionLog {
  time: string;             // ISO 8601
  exitCode: number;
  stdout: string;
  stderr: string;
}
`

### Notification

`	ypescript
interface Notification {
  type: 'automation_run' | 'task_run';
  automationId?: string;
  automationName?: string;
  taskId?: string;
  taskName?: string;
  timestamp: number;
  result: ExecutionLog | TaskResult;
}
`

### Template

`	ypescript
interface Template {
  id: string;
  name: string;
  description: string;
  defaultInterval: number;
  scriptType: 'javascript' | 'python' | 'powershell' | null;
  command: string | null;
  script: string | null;
  requiredParams: string[];
}
`

## Templates Built-in

| ID | Comando | Intervalo | Uso |
|---|---|---|---|
| uild-project | dotnet build | 60 min | Compilar proyectos .NET |
| disk-check | Get-PSDrive C \| Select-Object Used,Free | 5 min | Monitorear disco |
| git-sync | git pull | 30 min | Sincronizar repo |

## Custom Templates

Los usuarios pueden definir templates en ~/.pi/scheduler/templates.json:

`json
[
  {
    "id": "run-tests",
    "name": "Run tests",
    "description": "Run npm test periodically",
    "defaultInterval": 30,
    "scriptType": "javascript",
    "command": "npm test",
    "requiredParams": []
  }
]
`

## Interpolacion de Templates

Los templates soportan ${key} en command y script:

`	ypescript
scheduler.instantiateTemplate('build-project', {
  params: { repoPath: 'D:/repos/my-project' }
});
`

Seguridad: los valores interpolados deben coincidir con /^[a-zA-Z0-9_\\-/: .~]+$/. Caracteres shell (;, |, &, $, comillas) son rechazados.
