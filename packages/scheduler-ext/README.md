# pi-scheduler-ext

> v0.2.0 — Extension pi-coding-agent para pi-scheduler-core.

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
- **14 tools**: create_automation, run_task, list_automations, delete_automation,
  get_automation_logs, list_templates, instantiate_template, get_task_status,
  list_tasks, delete_task, check_notifications, ack_notifications,
  get_pending_summary, set_webhook
- **Slash command**: `/scheduler list|tasks|delete|logs|templates|notifications|ack`
- **Event handlers**: session_start (init scheduler), session_shutdown (stop scheduler)
- **UI notifications**: Automation/task results mapped to ExtensionUIContext.notify()

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
