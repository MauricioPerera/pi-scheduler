import { Scheduler } from '../packages/scheduler-core/src/scheduler.js';

const scheduler = Scheduler.create({
  dataDir: 'C:/temp/scheduler-daemon-test',
  tickIntervalMs: 5000,
});

scheduler.createAutomation({
  name: 'daemon-bg-test',
  intervalMinutes: 0.05,
  command: 'echo daemon-bg-ok',
  cwd: 'C:/temp',
});

console.log('Created automation');
console.log('Automations:', scheduler.listAutomations().map(a => a.id));
