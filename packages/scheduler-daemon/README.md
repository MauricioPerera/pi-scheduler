# @earendil-works/pi-scheduler-daemon

Standalone daemon for pi-scheduler. Runs automations even when pi is closed.

## Install

```bash
npm install -g @earendil-works/pi-scheduler-daemon
```

## Usage

```bash
# Start daemon
pi-scheduler-daemon start

# Stop daemon
pi-scheduler-daemon stop

# Check status
pi-scheduler-daemon status
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SCHEDULER_DATA_DIR` | `~/.pi/scheduler` | Data directory |
| `SCHEDULER_PID_FILE` | `~/.pi/scheduler/.daemon.pid` | PID file path |

## How it works

The daemon reads automations from the same `automations.json` that pi-scheduler-core uses. It runs its own tick loop (30s interval) and writes notifications to the shared `notifications.jsonl`. When pi restarts, it picks up pending notifications via `checkNotifications()`.

## Lifecycle

```
pi-coding-agent (TUI open)
  |
  v
pi-scheduler-ext creates automations
  |
  v
User closes pi TUI
  |
  v
pi-scheduler-daemon (already running)
  |
  v
Continues ticking, executing automations
  |
  v
User reopens pi TUI
  |
  v
pi-scheduler-ext reads pending notifications
```

## License

MIT
