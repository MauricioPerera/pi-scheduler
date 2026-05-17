# pi-scheduler-ext

> v0.2.3 — Extension pi-coding-agent para pi-scheduler-core.

## Install

```bash
npm install pi-scheduler-ext
```

Requires peer dependencies:
- `@earendil-works/pi-agent-core` ^0.74.0
- `@earendil-works/pi-coding-agent` ^0.74.0

## Usage

In your pi extension entry point:

```typescript
import { schedulerExtension } from 'pi-scheduler-ext';

export default schedulerExtension;
```

The extension registers:
- **15 tools**: create_automation, run_task, list_automations, delete_automation,
  get_automation_logs, list_templates, instantiate_template, get_task_status,
  list_tasks, delete_task, check_notifications, ack_notifications,
  get_pending_summary, set_webhook, **create_subagent_automation**
- **Slash command**: `/scheduler list|tasks|delete|logs|templates|notifications|ack`
- **Event handlers**: session_start (init scheduler), session_shutdown (stop scheduler)
- **UI notifications**: Automation/task results mapped to ExtensionUIContext.notify()

## Subagent Automations

`create_subagent_automation` schedules a recurring automation that delegates to a Claude subagent instead of running a shell command:

```typescript
// Via tool call from within pi:
create_subagent_automation({
  name: 'Nightly code review',
  intervalMinutes: 1440,
  cwd: 'D:/repos/myproject',
  agent: 'reviewer',           // built-in role, or name of ~/.pi/agent/agents/<name>.json
  task: 'Review all uncommitted changes and summarize risks.',
})

// Chain: scout finds issues, reviewer evaluates them
create_subagent_automation({
  name: 'Weekly audit',
  intervalMinutes: 10080,
  cwd: 'D:/repos/myproject',
  task: 'Initial scan',        // task for the default agent
  chain: [
    { agent: 'scout',    task: 'Find all TODO and FIXME comments.' },
    { agent: 'reviewer', task: 'Evaluate the findings from the previous step.' },
  ],
})
```

Built-in agent roles: `scout`, `researcher`, `planner`, `worker`, `reviewer`, `oracle`, `context-builder`.

Custom agents can be defined in `~/.pi/agent/agents/<name>.json`:

```json
{ "systemPrompt": "You are a security auditor. Focus on OWASP top-10 vulnerabilities." }
```

## Skills

Place templates in `~/.pi/agent/skills/scheduler-templates/SKILL.md`:

```markdown
---
name: scheduler-templates
description: My custom templates
---

## my-template

- **Comando**: `echo ${message}`
- **Intervalo**: 10 min
- **Params**: `message`
```

## License

MIT
