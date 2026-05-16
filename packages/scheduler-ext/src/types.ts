// ---------------------------------------------------------------------------
// Types — scheduler-ext
// ---------------------------------------------------------------------------

import type {
  Scheduler,
  Automation,
  Task,
  ExecutionLog,
  Notification,
  Template,
} from '@earendil-works/pi-scheduler-core';

export type { Scheduler, Automation, Task, ExecutionLog, Notification, Template };

export interface SkillTemplateEntry {
  id: string;
  name: string;
  description: string;
  defaultInterval: number;
  command?: string;
  script?: string;
  scriptType?: 'javascript' | 'python' | 'powershell';
  requiredParams?: string[];
}
