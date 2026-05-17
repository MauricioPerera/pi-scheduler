import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';

export function writePid(pidFile: string, dataDir: string, pid: number): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(pidFile, String(pid), 'utf8');
}

export function removePid(pidFile: string): void {
  try { unlinkSync(pidFile); } catch {}
}

export function readPid(pidFile: string): number | null {
  if (!existsSync(pidFile)) return null;
  try {
    const pid = parseInt(readFileSync(pidFile, 'utf8'), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
