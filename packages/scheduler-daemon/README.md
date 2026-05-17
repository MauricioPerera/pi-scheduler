# pi-scheduler-daemon

> v0.3.2 — Standalone daemon for pi-scheduler. Runs automations even when pi is closed.

## Install

```bash
npm install -g pi-scheduler-daemon
```

## Usage

```bash
# Start daemon (blocks; use a process manager or background shell)
pi-scheduler-daemon start

# Stop running daemon
pi-scheduler-daemon stop

# Check status
pi-scheduler-daemon status
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `SCHEDULER_DATA_DIR` | `~/.pi/scheduler` | Data directory (shared with pi-scheduler-core) |
| `SCHEDULER_PID_FILE` | `{SCHEDULER_DATA_DIR}/.daemon.pid` | PID file path |
| `SCHEDULER_ALLOWED_DIRS` | _(none — uses core defaults)_ | Semicolon-separated list of directories that automations may use as CWD. Example: `/home/user/repos;/tmp` |

## How it works

The daemon reads automations from the same `automations.json` that `pi-scheduler-core` uses. It runs its own tick loop (30 s interval) and writes results to the shared `notifications.jsonl`. When pi restarts, `pi-scheduler-ext` picks up pending notifications via `checkNotifications()`.

```
pi-coding-agent session open
  └─ pi-scheduler-ext creates automations
       └─ User closes pi
            └─ pi-scheduler-daemon (already running) continues ticking
                 └─ User reopens pi
                      └─ pi-scheduler-ext reads pending notifications
```

## Crash recovery

If the daemon process dies unexpectedly, any automations that were mid-execution are marked as `failed` with `exitCode: -1` on the next start. If a JSON state file is corrupted on disk, it is backed up to `<file>.corrupted-<timestamp>.bak` before the scheduler resets to empty state.

## License

MIT
