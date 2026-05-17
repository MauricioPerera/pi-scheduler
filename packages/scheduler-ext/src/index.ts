/**
 * pi-scheduler-ext
 * Extension pi-coding-agent para pi-scheduler-core.
 *
 * Expone 15 tools, comandos slash, eventos de ciclo de vida,
 * y notificaciones UI integradas.
 */

export { schedulerExtension } from './extension.js';
export {
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
export { schedulerCommandHandler } from './commands.js';
export { loadSkillTemplates, parsedTemplateToCoreTemplate } from './skill-loader.js';
export { SqliteStorageAdapter } from './sqlite-adapter.js';

import { schedulerExtension as _schedulerExtension } from './extension.js';

export default _schedulerExtension;
