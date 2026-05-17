import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { writePid, removePid, readPid, isProcessRunning } from '../src/pid-utils.js';

const BASE = join(tmpdir(), `pi-daemon-test-${process.pid}`);

beforeAll(() => mkdirSync(BASE, { recursive: true }));

function tmpPidFile(): string {
  return join(BASE, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.pid`);
}

describe('writePid + readPid', () => {
  it('round-trips a PID', () => {
    const f = tmpPidFile();
    writePid(f, BASE, 42000);
    expect(readPid(f)).toBe(42000);
  });

  it('creates dataDir when absent', () => {
    const dir = join(BASE, `newdir-${Date.now()}`);
    const f = join(dir, 'daemon.pid');
    writePid(f, dir, 99);
    expect(existsSync(dir)).toBe(true);
    expect(readPid(f)).toBe(99);
    rmSync(dir, { recursive: true });
  });

  it('overwrites an existing PID file', () => {
    const f = tmpPidFile();
    writePid(f, BASE, 111);
    writePid(f, BASE, 222);
    expect(readPid(f)).toBe(222);
  });
});

describe('readPid', () => {
  it('returns null when file does not exist', () => {
    expect(readPid(join(BASE, 'nonexistent.pid'))).toBeNull();
  });

  it('returns null for non-numeric content', () => {
    const f = tmpPidFile();
    writeFileSync(f, 'not-a-pid', 'utf8');
    expect(readPid(f)).toBeNull();
  });
});

describe('removePid', () => {
  it('deletes the pid file', () => {
    const f = tmpPidFile();
    writePid(f, BASE, 123);
    expect(existsSync(f)).toBe(true);
    removePid(f);
    expect(existsSync(f)).toBe(false);
  });

  it('is a no-op when file is absent', () => {
    expect(() => removePid(join(BASE, 'gone.pid'))).not.toThrow();
  });
});

describe('isProcessRunning', () => {
  it('returns true for the current process', () => {
    expect(isProcessRunning(process.pid)).toBe(true);
  });
});
