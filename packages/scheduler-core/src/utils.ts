import { writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// ID Generator
// ---------------------------------------------------------------------------

let _idCounter = 0;

export function generateId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  const seq = (++_idCounter).toString(36);
  return `${ts}-${rnd}-${seq}`;
}

// ---------------------------------------------------------------------------
// Atomic Write
// ---------------------------------------------------------------------------

export function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp';
  try {
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, filePath);
  } catch (err) {
    try { unlinkSync(tmp); } catch {}
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cross-process File Lock
// ---------------------------------------------------------------------------

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function withFileLock<T>(filePath: string, fn: () => T): T {
  const lockPath = filePath + '.lock';
  const maxRetries = 20;

  for (let i = 0; i < maxRetries; i++) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      try {
        return fn();
      } finally {
        try { unlinkSync(lockPath); } catch {}
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

      // Stale lock detection: steal if the owning process is dead
      try {
        const rawPid = parseInt(readFileSync(lockPath, 'utf8'), 10);
        if (!isNaN(rawPid) && !isProcessAlive(rawPid)) {
          try { unlinkSync(lockPath); } catch {}
          continue;
        }
      } catch {}

      // No sleep — critical sections are microseconds; spinning is safe here
    }
  }

  console.error(`[pi-scheduler] Could not acquire file lock for ${filePath}, proceeding without lock`);
  return fn();
}

export function safeWrite(filePath: string, content: string): void {
  try {
    withFileLock(filePath, () => atomicWrite(filePath, content));
  } catch (err) {
    console.error(`[pi-scheduler] safeWrite failed for ${filePath}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Path Resolution
// ---------------------------------------------------------------------------

export function resolveDataDir(input?: string): string {
  if (!input) {
    return join(homedir(), '.pi', 'scheduler');
  }
  if (input.startsWith('~/') || input === '~') {
    return join(homedir(), input.slice(1));
  }
  return resolve(input);
}

// ---------------------------------------------------------------------------
// Rotating JSONL
// ---------------------------------------------------------------------------

export const MAX_NOTIFICATION_BYTES = 512 * 1024;
export const KEEP_NOTIFICATION_LINES = 250;
export const TAIL_BYTES = 128 * 1024;

// ---------------------------------------------------------------------------
// No-op Logger
// ---------------------------------------------------------------------------

export const noopLogger: import('./types.js').Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
