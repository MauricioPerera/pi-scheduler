// ---------------------------------------------------------------------------
// Types — scheduler-core
// ---------------------------------------------------------------------------

export type ScriptType = 'javascript' | 'python' | 'powershell';

// ---------------------------------------------------------------------------
// Subagent
// ---------------------------------------------------------------------------

export interface SubagentConfig {
  agent?: string;
  task: string;
  chain?: Array<{ agent: string; task: string }>;
}

export type SubagentExecutor = (
  config: SubagentConfig,
  cwd: string
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

// ---------------------------------------------------------------------------
// Storage Adapter
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  loadAutomations(): Map<string, Automation>;
  saveAutomations(map: Map<string, Automation>): void;
  loadTasks(): Map<string, Task>;
  saveTasks(map: Map<string, Task>): void;
  loadConfig(): Record<string, unknown>;
  saveConfig(config: Record<string, unknown>): void;
}

export interface SchedulerOptions {
  dataDir?: string;
  tickIntervalMs?: number;
  webhookUrl?: string;
  allowedDirs?: string[];
  logger?: Logger;
  subagentExecutor?: SubagentExecutor;
  storageAdapter?: StorageAdapter;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------

export interface Automation {
  id: string;
  name: string;
  intervalMinutes: number;
  cwd: string;
  command: string | null;
  script: string | null;
  scriptType: ScriptType;
  model: string | null;
  reasoningEffort: string | null;
  subagentConfig: SubagentConfig | null;
  nextRun: number;
  logs: ExecutionLog[];
}

export interface CreateAutomationOptions {
  name: string;
  intervalMinutes: number;
  cwd?: string;
  command?: string;
  script?: string;
  scriptType?: ScriptType;
  model?: string;
  reasoningEffort?: string;
  subagentConfig?: SubagentConfig;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  name: string;
  cwd: string;
  command: string | null;
  script: string | null;
  scriptType: ScriptType;
  subagentConfig: SubagentConfig | null;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface RunTaskOptions {
  name: string;
  cwd?: string;
  command?: string;
  script?: string;
  scriptType?: ScriptType;
  timeoutMs?: number;
  subagentConfig?: SubagentConfig;
}

// ---------------------------------------------------------------------------
// Execution Log
// ---------------------------------------------------------------------------

export interface ExecutionLog {
  time: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

export interface Notification {
  type: 'automation_run' | 'task_run';
  automationId?: string;
  automationName?: string;
  taskId?: string;
  taskName?: string;
  timestamp: number;
  result: ExecutionLog | TaskResult;
}

export interface TaskResult {
  status: 'completed' | 'failed';
  exitCode: number;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export interface Template {
  id: string;
  name: string;
  description: string;
  defaultInterval: number;
  scriptType: ScriptType | null;
  command: string | null;
  script: string | null;
  subagentConfig: SubagentConfig | null;
  requiredParams: string[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  defaultInterval: number;
  scriptType: ScriptType | null;
  hasCommand: boolean;
  hasScript: boolean;
}

export interface InstantiateTemplateOptions {
  name?: string;
  intervalMinutes?: number;
  cwd?: string;
  params?: Record<string, string>;
}

export interface InterpolationResult {
  command: string | null;
  script: string | null;
  missing: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export interface TaskArgs {
  command?: string;
  script?: string;
  scriptType?: string;
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type SchedulerEventMap = {
  automation_run: { automationId: string; automationName: string; result: ExecutionLog };
  task_run: { taskId: string; taskName: string; result: TaskResult };
  notification: Notification;
  error: { message: string; automationId?: string; taskId?: string };
};

export type SchedulerEventName = keyof SchedulerEventMap;
export type SchedulerEventHandler<T extends SchedulerEventName> = (payload: SchedulerEventMap[T]) => void;
