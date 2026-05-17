# pi-scheduler-core

> v0.2.2 — Motor de scheduling persistente para agentes de IA. Zero dependencies (solo Node.js built-ins).

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

## Subagent Executor

`scheduler-core` is zero-dependency, but supports delegating automations to an LLM subagent via an optional executor callback:

```typescript
import { Scheduler, SubagentExecutor } from 'pi-scheduler-core';

const myExecutor: SubagentExecutor = async (config, cwd) => {
  // config.agent — role name (optional)
  // config.task  — instruction for the agent
  // config.chain — sequential multi-agent chain (optional)
  // ...invoke your LLM here...
  return { exitCode: 0, stdout: '...', stderr: '' };
};

const scheduler = Scheduler.create({
  dataDir: '~/.pi/scheduler',
  subagentExecutor: myExecutor,
});

// Automation backed by a subagent instead of a shell command
scheduler.createAutomation({
  name: 'Nightly review',
  intervalMinutes: 1440,
  cwd: 'D:/repos/myproject',
  subagentConfig: {
    agent: 'reviewer',
    task: 'Review all uncommitted changes and summarize risks.',
  },
});
```

`pi-scheduler-ext` ships a ready-made executor that invokes `claude CLI` with built-in agent roles.

## Security

Five layers of validation:
1. Command blocklist (rm -rf, format, curl | sh, etc.)
2. Script blocklist (os.system, shutil.rmtree, etc.)
3. CWD allowlist (home, C:/temp, explicit allowed dirs)
4. Template interpolation hardening (whitelist chars only)
5. Required params validation

## Templates

Built-in (11 total): `build-project`, `disk-check`, `git-sync`, `npm-test`, `npm-outdated`, `memory-check`, `service-ping`, `git-log`, `nightly-review`, `daily-research`, `weekly-audit`

The last three are subagent templates — they require a `subagentExecutor` to be configured.

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

// Subagent template (needs subagentExecutor in SchedulerOptions)
const review = scheduler.instantiateTemplate('nightly-review', {
  name: 'Nightly review',
  cwd: 'D:/repos/myproject',
});
```

## License

MIT
