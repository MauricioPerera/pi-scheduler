import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';
import {
  loadNotificationsState,
  saveNotificationsState,
  appendNotification,
  readNotifications,
  getPendingCount,
  getPendingSummary,
} from '../src/notifications.js';
import type { Notification } from '../src/types.js';

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
