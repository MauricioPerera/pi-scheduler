import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
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

export function safeWrite(filePath: string, content: string): void {
  try { atomicWrite(filePath, content); } catch {}
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
