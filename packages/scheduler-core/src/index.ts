/**
 * pi-scheduler-core
 * Motor de scheduling persistente para agentes de IA.
 * Zero dependencies (Node.js built-ins only).
 */

export { Scheduler } from './scheduler.js';
export type {
  SchedulerOptions,
  Logger,
  Automation,
  CreateAutomationOptions,
  Task,
  RunTaskOptions,
  ExecutionLog,
  Notification,
  TaskResult,
  Template,
  TemplateSummary,
  InstantiateTemplateOptions,
  InterpolationResult,
  ValidationResult,
  TaskArgs,
  SchedulerEventMap,
  SchedulerEventName,
  SchedulerEventHandler,
  SubagentConfig,
  SubagentExecutor,
  StorageAdapter,
} from './types.js';
export { validateTask, validateCommand, validateScript, validateCwd, validateInterpolationValue } from './security.js';
export { BUILTIN_TEMPLATES, interpolateTemplate, instantiateTemplateOptions } from './templates.js';
export { generateId, atomicWrite, safeWrite, withFileLock, resolveDataDir, noopLogger } from './utils.js';
export {
  getStorePaths, ensureStoreDirs,
  loadAutomations, loadTasks, loadConfig,
  saveAutomations, saveTasks, saveConfig,
  getScriptExt, getScriptRunner, resolveCommand, deleteScriptFile,
  JsonStorageAdapter,
} from './store.js';
export {
  loadNotificationsState, saveNotificationsState,
  appendNotification, readNotifications,
  getPendingCount, getPendingSummary,
  sendHttpNotification,
} from './notifications.js';
export { executeCommand } from './executor.js';
