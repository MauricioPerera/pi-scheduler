import Database from 'better-sqlite3';
import type { StorageAdapter, Automation, Task } from 'pi-scheduler-core';

// ---------------------------------------------------------------------------
// SqliteStorageAdapter
// ---------------------------------------------------------------------------

export class SqliteStorageAdapter implements StorageAdapter {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  loadAutomations(): Map<string, Automation> {
    const rows = this.db.prepare('SELECT id, data FROM automations').all() as { id: string; data: string }[];
    const map = new Map<string, Automation>();
    for (const row of rows) {
      try { map.set(row.id, JSON.parse(row.data) as Automation); } catch (err) {
        console.error(`[pi-scheduler] Failed to parse automation ${row.id} from SQLite:`, err);
      }
    }
    return map;
  }

  saveAutomations(map: Map<string, Automation>): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM automations').run();
      const insert = this.db.prepare('INSERT INTO automations (id, data) VALUES (?, ?)');
      for (const [id, a] of map) insert.run(id, JSON.stringify(a));
    });
    tx();
  }

  loadTasks(): Map<string, Task> {
    const rows = this.db.prepare('SELECT id, data FROM tasks').all() as { id: string; data: string }[];
    const map = new Map<string, Task>();
    for (const row of rows) {
      try { map.set(row.id, JSON.parse(row.data) as Task); } catch (err) {
        console.error(`[pi-scheduler] Failed to parse task ${row.id} from SQLite:`, err);
      }
    }
    return map;
  }

  saveTasks(map: Map<string, Task>): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM tasks').run();
      const insert = this.db.prepare('INSERT INTO tasks (id, data) VALUES (?, ?)');
      for (const [id, t] of map) insert.run(id, JSON.stringify(t));
    });
    tx();
  }

  loadConfig(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[];
    const config: Record<string, unknown> = {};
    for (const row of rows) {
      try { config[row.key] = JSON.parse(row.value); } catch {}
    }
    return config;
  }

  saveConfig(config: Record<string, unknown>): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM config').run();
      const insert = this.db.prepare('INSERT INTO config (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(config)) {
        insert.run(key, JSON.stringify(value));
      }
    });
    tx();
  }

  close(): void {
    this.db.close();
  }
}
