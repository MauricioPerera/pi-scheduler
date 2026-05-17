# pi-scheduler-core

> v0.2.0 — Motor de scheduling persistente para agentes de IA. Zero dependencies (solo Node.js built-ins).

## Install

```bash
npm install pi-scheduler-core
```

## Usage

```typescript
import { Scheduler } from 'pi-scheduler-core';

const scheduler = Scheduler.create({
  dataDir: '~/.pi/scheduler',
  tickIntervalMs: 30000,
  allowedDirs: ['D:/repos', 'C:/temp'],
});

scheduler.start();

// Recurring automation
const auto = scheduler.createAutomation({
  name: 'Build MyProject',
  intervalMinutes: 60,
  command: 'dotnet build',
  cwd: 'D:/repos/myproject',
});

// One-shot task
const task = scheduler.runTask({
  name: 'Run tests',
  command: 'npm test',
  cwd: 'D:/repos/myproject',
});

// Listen to events
scheduler.on('automation_run', (event) => {
  console.log(`${event.automationName} finished with exit code ${event.result.exitCode}`);
});

// Stop
scheduler.stop();
```

## Security

Five layers of validation:
1. Command blocklist (rm -rf, format, curl | sh, etc.)
2. Script blocklist (os.system, shutil.rmtree, etc.)
3. CWD allowlist (home, C:/temp, explicit allowed dirs)
4. Template interpolation hardening (whitelist chars only)
5. Required params validation

## Templates

Built-in: `build-project`, `disk-check`, `git-sync`, `npm-test`, `npm-outdated`, `memory-check`, `service-ping`, `git-log`

```typescript
const auto = scheduler.instantiateTemplate('build-project', {
  name: 'Build MyProject',
  cwd: 'D:/repos/myproject',
});

// Template with params
const ping = scheduler.instantiateTemplate('service-ping', {
  cwd: 'C:/temp',
  params: { host: 'localhost', port: '8080' },
});
```

## License

MIT
