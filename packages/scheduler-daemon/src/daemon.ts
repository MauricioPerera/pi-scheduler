#!/usr/bin/env node
import { Scheduler } from 'pi-scheduler-core';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { writePid, removePid, readPid, isProcessRunning } from './pid-utils.js';

const DATA_DIR = process.env.SCHEDULER_DATA_DIR || join(homedir(), '.pi', 'scheduler');
const PID_FILE = process.env.SCHEDULER_PID_FILE || join(DATA_DIR, '.daemon.pid');
const ALLOWED_DIRS: string[] = process.env.SCHEDULER_ALLOWED_DIRS
  ? process.env.SCHEDULER_ALLOWED_DIRS.split(';').filter(Boolean)
  : [];

let activeScheduler: ReturnType<typeof Scheduler.create> | null = null;

function emergencyShutdown(label: string, err: unknown): void {
  console.error(`[Daemon] ${label}:`, err);
  try { activeScheduler?.stop(); } catch {}
  removePid(PID_FILE);
  process.exit(1);
}

process.on('uncaughtException', (err) => emergencyShutdown('Uncaught exception', err));
process.on('unhandledRejection', (reason) => emergencyShutdown('Unhandled rejection', reason));

async function start(): Promise<void> {
  const existingPid = readPid(PID_FILE);
  if (existingPid && isProcessRunning(existingPid)) {
    console.error(`Daemon already running (PID ${existingPid})`);
    process.exit(1);
  }

  writePid(PID_FILE, DATA_DIR, process.pid);
  console.log(`[Daemon] Starting pi-scheduler-daemon (PID ${process.pid})`);
  console.log(`[Daemon] Data dir: ${DATA_DIR}`);
  if (ALLOWED_DIRS.length > 0) {
    console.log(`[Daemon] Allowed dirs: ${ALLOWED_DIRS.join(', ')}`);
  }

  const scheduler = Scheduler.create({
    dataDir: DATA_DIR,
    tickIntervalMs: 30000,
    allowedDirs: ALLOWED_DIRS,
    logger: {
      info: (m) => console.log(`[Scheduler] ${m}`),
      warn: (m) => console.warn(`[Scheduler] ${m}`),
      error: (m) => console.error(`[Scheduler] ${m}`),
    },
  });

  activeScheduler = scheduler;
  scheduler.start();
  console.log('[Daemon] Scheduler tick loop active (30s interval)');

  const shutdown = () => {
    console.log('\n[Daemon] Shutting down...');
    scheduler.stop();
    removePid(PID_FILE);
    console.log('[Daemon] Stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => removePid(PID_FILE));

  // Keep alive
  setInterval(() => {}, 60000);
}

function stop(): void {
  const pid = readPid(PID_FILE);
  if (!pid) {
    console.log('[Daemon] No PID file found');
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log(`[Daemon] PID ${pid} not running, cleaning up`);
    removePid(PID_FILE);
    return;
  }

  console.log(`[Daemon] Sending SIGTERM to PID ${pid}`);
  try {
    process.kill(pid, 'SIGTERM');
    console.log('[Daemon] Stop signal sent');
  } catch (err) {
    console.error(`[Daemon] Failed to kill PID ${pid}:`, err);
    removePid(PID_FILE);
  }
}

function status(): void {
  const pid = readPid(PID_FILE);
  if (!pid) {
    console.log('[Daemon] Not running (no PID file)');
    return;
  }

  if (isProcessRunning(pid)) {
    console.log(`[Daemon] Running (PID ${pid})`);
  } else {
    console.log(`[Daemon] Stale PID file (${pid}), cleaning up`);
    removePid(PID_FILE);
  }
}

function main(): void {
  const cmd = process.argv[2] || 'start';

  switch (cmd) {
    case 'start':
      start();
      break;
    case 'stop':
      stop();
      break;
    case 'status':
      status();
      break;
    default:
      console.error('Usage: pi-scheduler-daemon [start|stop|status]');
      process.exit(1);
  }
}

main();
