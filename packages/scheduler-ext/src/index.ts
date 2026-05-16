/**
 * pi-scheduler-ext
 * Extension pi-coding-agent para pi-scheduler-core.
 *
 * Expone 14 tools, comandos slash, eventos de ciclo de vida,
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
} from './tools.js';
export { schedulerCommandHandler } from './commands.js';
export { loadSkillTemplates, parsedTemplateToCoreTemplate } from './skill-loader.js';

import { schedulerExtension as _schedulerExtension } from './extension.js';

export default _schedulerExtension;
