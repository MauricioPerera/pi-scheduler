/**
 * pi-scheduler-core
 * Motor de scheduling persistente para agentes de IA.
 *
 * Zero dependencies (excepto Node.js built-ins).
 */

export interface SchedulerOptions {
  dataDir?: string;
  tickIntervalMs?: number;
  webhookUrl?: string;
  allowedDirs?: string[];
}

// TODO: Implementar Scheduler class, store, security, templates, notifications
export class Scheduler {
  static create(options?: SchedulerOptions): Scheduler {
    return new Scheduler(options);
  }

  private constructor(options?: SchedulerOptions) {
    // Placeholder
  }
}
