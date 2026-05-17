#!/usr/bin/env node
import { Scheduler } from 'pi-scheduler-core';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';

const DATA_DIR = process.env.SCHEDULER_DATA_DIR || join(homedir(), '.pi', 'scheduler');
const PID_FILE = process.env.SCHEDULER_PID_FILE || join(DATA_DIR, '.daemon.pid');

function writePid(pid: number): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid), 'utf8');
}

function removePid(): void {
  try { unlinkSync(PID_FILE); } catch {}
}

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8'), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

let activeScheduler: ReturnType<typeof Scheduler.create> | null = null;

function emergencyShutdown(label: string, err: unknown): void {
  console.error(`[Daemon] ${label}:`, err);
  try { activeScheduler?.stop(); } catch {}
  removePid();
  process.exit(1);
}

process.on('uncaughtException', (err) => emergencyShutdown('Uncaught exception', err));
process.on('unhandledRejection', (reason) => emergencyShutdown('Unhandled rejection', reason));

async function start(): Promise<void> {
  const existingPid = readPid();
  if (existingPid && isRunning(existingPid)) {
    console.error(`Daemon already running (PID ${existingPid})`);
    process.exit(1);
  }

  writePid(process.pid);
  console.log(`[Daemon] Starting pi-scheduler-daemon (PID ${process.pid})`);
  console.log(`[Daemon] Data dir: ${DATA_DIR}`);

  const scheduler = Scheduler.create({
    dataDir: DATA_DIR,
    tickIntervalMs: 30000,
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
    removePid();
    console.log('[Daemon] Stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', removePid);

  // Keep alive
  setInterval(() => {}, 60000);
}

function stop(): void {
  const pid = readPid();
  if (!pid) {
    console.log('[Daemon] No PID file found');
    return;
  }

  if (!isRunning(pid)) {
    console.log(`[Daemon] PID ${pid} not running, cleaning up`);
    removePid();
    return;
  }

  console.log(`[Daemon] Sending SIGTERM to PID ${pid}`);
  try {
    process.kill(pid, 'SIGTERM');
    console.log('[Daemon] Stop signal sent');
  } catch (err) {
    console.error(`[Daemon] Failed to kill PID ${pid}:`, err);
    removePid();
  }
}

function status(): void {
  const pid = readPid();
  if (!pid) {
    console.log('[Daemon] Not running (no PID file)');
    return;
  }

  if (isRunning(pid)) {
    console.log(`[Daemon] Running (PID ${pid})`);
  } else {
    console.log(`[Daemon] Stale PID file (${pid}), cleaning up`);
    removePid();
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
