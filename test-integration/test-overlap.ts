import { Scheduler } from '../packages/scheduler-core/src/scheduler.js';
import { rmSync } from 'node:fs';

async function main() {
  const dir = 'C:/temp/overlap-test';
  rmSync(dir, { recursive: true, force: true });

  const scheduler = Scheduler.create({ dataDir: dir, tickIntervalMs: 1000 });

  let calls = 0;
  const orig = (scheduler as any).runAutomation.bind(scheduler);
  (scheduler as any).runAutomation = async (a: any) => {
    calls++;
    console.log('runAutomation called, calls=', calls, 'id=', a.id);
    await new Promise(r => setTimeout(r, 3000));
    console.log('runAutomation finished');
  };

  scheduler.createAutomation({ name: 'overlap', intervalMinutes: 0.02, command: 'echo x', cwd: 'C:/temp' });
  scheduler.start();

  await new Promise(r => setTimeout(r, 2500));
  console.log('After 2.5s, calls should be 1:', calls);

  scheduler.stop();
}

main();
