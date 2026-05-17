import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import {
  loadNotificationsState,
  saveNotificationsState,
  appendNotification,
  readNotifications,
  getPendingCount,
  getPendingSummary,
  sendHttpNotification,
} from '../src/notifications.js';
import type { Notification } from '../src/types.js';

const BASE_NOTIFICATION: Notification = {
  type: 'task_run',
  taskId: 't1',
  taskName: 'Test',
  timestamp: 1000,
  result: { status: 'completed', exitCode: 0 },
};

describe('Notifications', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = join(tmpdir(), `notifications-${Date.now()}.jsonl`);
  });

  afterEach(() => {
    if (existsSync(filePath)) rmSync(filePath);
  });

  describe('load/save state', () => {
    it('loads default state when file missing', () => {
      const state = loadNotificationsState('/nonexistent/file.json');
      expect(state.lastAck).toBe(0);
    });

    it('roundtrips state', () => {
      saveNotificationsState(filePath, { lastAck: 12345 });
      const loaded = loadNotificationsState(filePath);
      expect(loaded.lastAck).toBe(12345);
    });
  });

  describe('appendNotification', () => {
    it('appends a notification', () => {
      const n: Notification = {
        type: 'automation_run',
        automationId: 'abc',
        automationName: 'Test',
        timestamp: 1000,
        result: { time: '2024-01-01T00:00:00Z', exitCode: 0, stdout: '', stderr: '' },
      };
      appendNotification(filePath, n);

      const pending = readNotifications(filePath, 0);
      expect(pending).toHaveLength(1);
      expect(pending[0].automationId).toBe('abc');
    });

    it('filters by lastAck', () => {
      appendNotification(filePath, {
        type: 'task_run',
        taskId: 't1',
        taskName: 'Task1',
        timestamp: 100,
        result: { status: 'completed', exitCode: 0 },
      });
      appendNotification(filePath, {
        type: 'task_run',
        taskId: 't2',
        taskName: 'Task2',
        timestamp: 200,
        result: { status: 'completed', exitCode: 0 },
      });

      expect(readNotifications(filePath, 0)).toHaveLength(2);
      expect(readNotifications(filePath, 150)).toHaveLength(1);
      expect(readNotifications(filePath, 250)).toHaveLength(0);
    });

    it('counts pending notifications', () => {
      appendNotification(filePath, {
        type: 'automation_run',
        automationId: 'a1',
        automationName: 'Auto1',
        timestamp: 100,
        result: { time: '2024-01-01T00:00:00Z', exitCode: 0, stdout: '', stderr: '' },
      });
      appendNotification(filePath, {
        type: 'automation_run',
        automationId: 'a2',
        automationName: 'Auto2',
        timestamp: 200,
        result: { time: '2024-01-01T00:00:00Z', exitCode: 1, stdout: '', stderr: '' },
      });

      expect(getPendingCount(filePath, 0)).toBe(2);
      expect(getPendingCount(filePath, 150)).toBe(1);
    });

    it('summarizes by automation name', () => {
      appendNotification(filePath, {
        type: 'automation_run',
        automationId: 'a1',
        automationName: 'Build',
        timestamp: 100,
        result: { time: '2024-01-01T00:00:00Z', exitCode: 0, stdout: '', stderr: '' },
      });
      appendNotification(filePath, {
        type: 'automation_run',
        automationId: 'a2',
        automationName: 'Build',
        timestamp: 200,
        result: { time: '2024-01-01T00:00:00Z', exitCode: 0, stdout: '', stderr: '' },
      });
      appendNotification(filePath, {
        type: 'task_run',
        taskId: 't1',
        taskName: 'Test',
        timestamp: 300,
        result: { status: 'completed', exitCode: 0 },
      });

      const summary = getPendingSummary(filePath, 0);
      expect(summary.count).toBe(3);
      expect(summary.byAutomation.Build).toBe(2);
      expect(summary.byAutomation.Test).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// sendHttpNotification
// ---------------------------------------------------------------------------

function startServer(handler: Parameters<typeof createServer>[0]): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, port });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('sendHttpNotification', () => {
  it('delivers payload to a listening server', async () => {
    const received: string[] = [];
    const { server, port } = await startServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => { received.push(body); res.writeHead(200); res.end(); });
    });

    await sendHttpNotification(`http://localhost:${port}`, BASE_NOTIFICATION, 1, 10);
    await closeServer(server);

    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]).taskId).toBe('t1');
  });

  it('retries on 500 response and logs error after all attempts', async () => {
    let attempts = 0;
    const { server, port } = await startServer((_req, res) => {
      attempts++;
      res.writeHead(500);
      res.end();
    });

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await sendHttpNotification(`http://localhost:${port}`, BASE_NOTIFICATION, 2, 10);
    spy.mockRestore();
    await closeServer(server);

    expect(attempts).toBe(2);
  });

  it('succeeds after one retry', async () => {
    let attempts = 0;
    const { server, port } = await startServer((_req, res) => {
      attempts++;
      res.writeHead(attempts === 1 ? 500 : 200);
      res.end();
    });

    await sendHttpNotification(`http://localhost:${port}`, BASE_NOTIFICATION, 3, 10);
    await closeServer(server);

    expect(attempts).toBe(2);
  });

  it('does not throw on connection refused', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      sendHttpNotification('http://localhost:19993', BASE_NOTIFICATION, 1, 10),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('does not throw on invalid URL', async () => {
    await expect(
      sendHttpNotification('not-a-url', BASE_NOTIFICATION, 1, 10),
    ).resolves.toBeUndefined();
  });

  it('does not throw on empty url', async () => {
    await expect(
      sendHttpNotification('', BASE_NOTIFICATION, 1, 10),
    ).resolves.toBeUndefined();
  });
});
