# pi-scheduler-core

> v0.3.3 — Motor de scheduling persistente para agentes de IA. Zero dependencies (solo Node.js built-ins).

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

## Backoff on Repeated Failures

Automations that exit with a non-zero code automatically back off exponentially so a broken automation does not hammer the system:

| Consecutive failures | Next retry delay |
|---|---|
| 1 | 1× interval |
| 2 | 2× interval |
| 3 | 4× interval |
| 4 | 8× interval |
| 5+ | 16× interval (capped at 24 h); warning logged |

A successful run resets the counter to 0.

## Security

Five layers of validation:

1. **Command blocklist** — blocks dangerous patterns (`rm -rf`, `format`, `curl | sh`, etc.) using word-boundary matching.
2. **Script blocklist** — blocks dangerous Python/shell calls (`os.system`, `shutil.rmtree`, etc.).
3. **CWD allowlist** — working directory must be under `~`, `C:/temp`, or an explicitly configured `allowedDirs` entry.
4. **Template interpolation hardening** — param values validated against a character whitelist before substitution.
5. **Required params validation** — templates with `requiredParams` refuse to run if any param is missing.

## Persistence

State is stored as atomic JSON files (`.tmp` + `renameSync`) in `dataDir`. If a file is corrupted on disk, the scheduler renames it to `<file>.corrupted-<timestamp>.bak` before resetting to empty state, so no data is silently discarded.

Optionally use `SqliteStorageAdapter` (from `pi-scheduler-ext`) for SQLite-backed persistence.

## Templates

14 built-in templates grouped by type:

**Shell command templates** (no extra dependencies):

| ID | Default interval | Description |
|---|---|---|
| `build-project` | 60 min | `dotnet build` |
| `disk-check` | 5 min | PowerShell disk space check |
| `git-sync` | 30 min | `git pull` |
| `npm-test` | 30 min | `npm test` |
| `npm-outdated` | 1440 min | `npm outdated` |
| `memory-check` | 15 min | Top 5 processes by memory |
| `service-ping` | 5 min | TCP reachability check (params: `host`, `port`) |
| `git-log` | 60 min | Last 10 commits |

**Subagent templates** (require `subagentExecutor` in `SchedulerOptions`):

| ID | Default interval | Agent role |
|---|---|---|
| `nightly-review` | 1440 min | `reviewer` |
| `daily-research` | 1440 min | `researcher` |
| `weekly-audit` | 10080 min | `oracle` |

**Playwright templates** (require `playwright` installed in the automation's `cwd`):

| ID | Default interval | Description |
|---|---|---|
| `web-screenshot` | 60 min | Screenshot to `screenshot.png` (param: `url`) |
| `url-health-check` | 5 min | HTTP status < 400 check (param: `url`) |
| `login-flow` | 30 min | Login form check (param: `url`; env: `PW_USERNAME`, `PW_PASSWORD`) |

```typescript
// Shell template
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

// Register a custom template at runtime
scheduler.registerTemplate({
  id: 'my-task',
  name: 'My task',
  description: 'Custom automation.',
  defaultInterval: 30,
  scriptType: null,
  command: 'my-command',
  script: null,
  subagentConfig: null,
  requiredParams: [],
});
```

## License

MIT
