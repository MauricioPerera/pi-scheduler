# pi-scheduler-ext

> v0.2.7 — Extension pi-coding-agent para pi-scheduler-core.

Integrates `pi-scheduler-core` into the [pi-coding-agent](https://github.com/earendil-works/pi) runtime. Registers 15 AgentTools, one slash command, lifecycle event handlers, and a ready-made subagent executor that delegates automations to the `claude` CLI.

## Install

```bash
npm install pi-scheduler-ext
```

Peer dependencies (provided by the pi runtime):
- `@earendil-works/pi-agent-core` ^0.74.0
- `@earendil-works/pi-coding-agent` ^0.74.0

## Usage

```typescript
import schedulerExtension from 'pi-scheduler-ext';

export default schedulerExtension;
```

On `session_start` the extension:
- Creates a `Scheduler` scoped to `{session.cwd}/.pi/scheduler/`
- Loads custom templates from `{session.cwd}/.pi/agent/skills/scheduler-templates/SKILL.md`
- Sets allowed dirs to `[session.cwd, ~/repos]`
- Starts the tick loop (30 s interval)
- Shows a UI notification if there are pending notifications from a previous session

On `session_shutdown` it stops the scheduler and flushes state to disk.

## AgentTools (15)

| Tool | Description |
|---|---|
| `create_automation` | Create a recurring shell/script automation |
| `create_subagent_automation` | Create a recurring automation backed by an LLM subagent or chain |
| `list_automations` | List all automations with next-run time and last status |
| `delete_automation` | Delete an automation by ID |
| `get_automation_logs` | Get execution logs for an automation |
| `list_templates` | List available built-in and custom templates |
| `instantiate_template` | Create an automation from a template |
| `run_task` | Run a one-shot task immediately |
| `get_task_status` | Get status and output of a one-shot task |
| `list_tasks` | List all one-shot tasks |
| `delete_task` | Delete a one-shot task |
| `check_notifications` | Get unacknowledged notifications |
| `ack_notifications` | Acknowledge all notifications up to a timestamp |
| `get_pending_summary` | Get count of pending notifications per automation |
| `set_webhook` | Configure a webhook URL for automation results |

## Slash command

```
/scheduler list          — list automations (name, interval, next run, last status)
/scheduler tasks         — list one-shot tasks
/scheduler logs <id>     — last 10 execution logs for an automation
/scheduler templates     — list available templates
/scheduler notifications — pending notification count per automation
/scheduler ack           — acknowledge all pending notifications
/scheduler delete <id>   — delete an automation or task
```

## Subagent automations

`create_subagent_automation` schedules a recurring automation that delegates to a Claude subagent instead of running a shell command:

```typescript
// Single agent
create_subagent_automation({
  name: 'Nightly code review',
  intervalMinutes: 1440,
  cwd: 'D:/repos/myproject',
  agent: 'reviewer',
  task: 'Review all uncommitted changes and summarize risks.',
})

// Chain: each step receives the previous step's output as context
create_subagent_automation({
  name: 'Scout and review',
  intervalMinutes: 10080,
  cwd: 'D:/repos/myproject',
  chain: [
    { agent: 'scout',    task: 'Map the codebase structure and entry points.' },
    { agent: 'reviewer', task: 'Review the architecture described above.' },
  ],
})
```

Built-in agent roles:

| Role | Focus |
|---|---|
| `scout` | Codebase reconnaissance |
| `researcher` | Topic investigation with actionable findings |
| `planner` | Step-by-step implementation plans |
| `worker` | Implementation following existing conventions |
| `reviewer` | Code review for correctness, security, and maintainability |
| `oracle` | Independent critical assessment and blind-spot detection |
| `context-builder` | Structured documentation for future agent consumption |

Custom agents can be defined in `~/.pi/agent/agents/<name>.json`:

```json
{ "systemPrompt": "You are a security auditor. Focus on OWASP top-10 vulnerabilities." }
```

> **Note**: `claude` CLI must be available in `PATH` (`npm install -g @anthropic-ai/claude-code`). If it is not found, the executor returns `exitCode: -1` with an actionable install hint in `stderr`.

## SQLite storage adapter

Use SQLite instead of JSON files for automation/task persistence:

```typescript
import { SqliteStorageAdapter } from 'pi-scheduler-ext';
import { Scheduler } from 'pi-scheduler-core';

const scheduler = Scheduler.create({
  dataDir: '~/.pi/scheduler',
  storageAdapter: new SqliteStorageAdapter('~/.pi/scheduler/scheduler.db'),
});
```

Requires `better-sqlite3` (included as a dependency of `pi-scheduler-ext`).

## Custom templates via SKILL.md

Place a `SKILL.md` file at `{session.cwd}/.pi/agent/skills/scheduler-templates/SKILL.md`. Each `##` heading defines a template:

```markdown
## my-build
- **Command**: `dotnet build`
- **Interval**: 30 min
- **Params**: outputPath
```

Templates are loaded automatically at session start and usable via `instantiate_template` or `list_templates`.

## License

MIT
