import {
  existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Automation, Task, StorageAdapter } from './types.js';
import { safeWrite, resolveDataDir } from './utils.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function getStorePaths(dataDir?: string) {
  const resolved = resolveDataDir(dataDir);
  return {
    dir: resolved,
    scriptsDir: join(resolved, 'scripts'),
    automationsFile: join(resolved, 'automations.json'),
    tasksFile: join(resolved, 'tasks.json'),
    notificationsFile: join(resolved, 'notifications.jsonl'),
    configFile: join(resolved, 'config.json'),
    lastAckFile: join(resolved, 'last_ack.json'),
    templatesFile: join(resolved, 'templates.json'),
  };
}

// ---------------------------------------------------------------------------
// Directory Setup
// ---------------------------------------------------------------------------

export function ensureStoreDirs(paths: ReturnType<typeof getStorePaths>): void {
  if (!existsSync(paths.dir)) mkdirSync(paths.dir, { recursive: true });
  if (!existsSync(paths.scriptsDir)) mkdirSync(paths.scriptsDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Load State
// ---------------------------------------------------------------------------

export function loadAutomations(filePath: string): Map<string, Automation> {
  const map = new Map<string, Automation>();
  if (!existsSync(filePath)) return map;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8')) as Automation[];
    for (const a of data) map.set(a.id, a);
  } catch (err) {
    console.error(`[pi-scheduler] Failed to parse automations from ${filePath}:`, err);
  }
  return map;
}

export function loadTasks(filePath: string): Map<string, Task> {
  const map = new Map<string, Task>();
  if (!existsSync(filePath)) return map;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8')) as Task[];
    for (const t of data) map.set(t.id, t);
  } catch (err) {
    console.error(`[pi-scheduler] Failed to parse tasks from ${filePath}:`, err);
  }
  return map;
}

export function loadConfig(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[pi-scheduler] Failed to parse config from ${filePath}:`, err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Save State
// ---------------------------------------------------------------------------

export function saveAutomations(filePath: string, map: Map<string, Automation>): void {
  safeWrite(filePath, JSON.stringify(Array.from(map.values()), null, 2));
}

export function saveTasks(filePath: string, map: Map<string, Task>): void {
  safeWrite(filePath, JSON.stringify(Array.from(map.values()), null, 2));
}

export function saveConfig(filePath: string, config: Record<string, unknown>): void {
  safeWrite(filePath, JSON.stringify(config, null, 2));
}

// ---------------------------------------------------------------------------
// Script Management
// ---------------------------------------------------------------------------

export function getScriptExt(scriptType: string): string {
  if (scriptType === 'python') return '.py';
  if (scriptType === 'powershell') return '.ps1';
  return '.js';
}

export function getScriptRunner(scriptType: string): string {
  if (scriptType === 'python') return 'python';
  if (scriptType === 'powershell') return 'powershell -ExecutionPolicy Bypass -File';
  return 'node';
}

export function resolveCommand(automation: Automation | Task, scriptsDir: string): { command: string; cwd: string } {
  if (automation.script) {
    const ext = getScriptExt(automation.scriptType);
    const runner = getScriptRunner(automation.scriptType);
    const scriptPath = join(scriptsDir, automation.id + ext);
    writeFileSync(scriptPath, automation.script, 'utf8');
    return { command: `${runner} "${scriptPath}"`, cwd: automation.cwd };
  }
  return { command: automation.command ?? '', cwd: automation.cwd };
}

export function deleteScriptFile(id: string, scriptType: string, scriptsDir: string): void {
  const ext = getScriptExt(scriptType);
  const path = join(scriptsDir, id + ext);
  try { unlinkSync(path); } catch {}
}

// ---------------------------------------------------------------------------
// JsonStorageAdapter
// ---------------------------------------------------------------------------

export class JsonStorageAdapter implements StorageAdapter {
  constructor(private readonly paths: ReturnType<typeof getStorePaths>) {}

  loadAutomations(): Map<string, Automation> { return loadAutomations(this.paths.automationsFile); }
  saveAutomations(map: Map<string, Automation>): void { saveAutomations(this.paths.automationsFile, map); }
  loadTasks(): Map<string, Task> { return loadTasks(this.paths.tasksFile); }
  saveTasks(map: Map<string, Task>): void { saveTasks(this.paths.tasksFile, map); }
  loadConfig(): Record<string, unknown> { return loadConfig(this.paths.configFile); }
  saveConfig(config: Record<string, unknown>): void { saveConfig(this.paths.configFile, config); }
}

