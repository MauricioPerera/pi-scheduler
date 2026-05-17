import { appendFileSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Notification } from './types.js';
import { MAX_NOTIFICATION_BYTES, KEEP_NOTIFICATION_LINES } from './utils.js';

// ---------------------------------------------------------------------------
// Notifications — Append-only JSONL with rotation
// ---------------------------------------------------------------------------

export interface NotificationsState {
  lastAck: number;
}

export function loadNotificationsState(filePath: string): NotificationsState {
  if (!existsSync(filePath)) return { lastAck: 0 };
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return { lastAck: typeof data.lastAck === 'number' ? data.lastAck : 0 };
  } catch {
    return { lastAck: 0 };
  }
}

export function saveNotificationsState(filePath: string, state: NotificationsState): void {
  try {
    writeFileSync(filePath, JSON.stringify(state), 'utf8');
  } catch {}
}

export function appendNotification(filePath: string, notification: Notification): void {
  try {
    const line = JSON.stringify(notification) + '\n';
    appendFileSync(filePath, line, 'utf8');
    maybeRotate(filePath);
  } catch {}
}

export function readNotifications(filePath: string, lastAck: number): Notification[] {
  if (!existsSync(filePath)) return [];
  const lines: Notification[] = [];
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as Notification;
      if (record.timestamp > lastAck) {
        lines.push(record);
      }
    } catch {
      // skip malformed line
    }
  }
  return lines;
}

export function getPendingCount(filePath: string, lastAck: number): number {
  if (!existsSync(filePath)) return 0;
  let count = 0;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as Notification;
      if (record.timestamp > lastAck) count++;
    } catch {
      // skip
    }
  }
  return count;
}

export function getPendingSummary(
  filePath: string,
  lastAck: number
): { count: number; byAutomation: Record<string, number> } {
  const pending = readNotifications(filePath, lastAck);
  const byAutomation: Record<string, number> = {};
  for (const n of pending) {
    const key = n.automationName ?? n.taskName ?? 'unknown';
    byAutomation[key] = (byAutomation[key] ?? 0) + 1;
  }
  return { count: pending.length, byAutomation };
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

function maybeRotate(filePath: string): void {
  try {
    const stats = statSync(filePath);
    if (stats.size <= MAX_NOTIFICATION_BYTES) return;

    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length <= KEEP_NOTIFICATION_LINES) return;

    const kept = lines.slice(-KEEP_NOTIFICATION_LINES);
    writeFileSync(filePath, kept.join('\n') + '\n', 'utf8');
  } catch {
    // silently fail on rotation error
  }
}

// ---------------------------------------------------------------------------
// HTTP Webhook (with retry + timeout)
// ---------------------------------------------------------------------------

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export async function sendHttpNotification(
  url: string,
  record: Notification,
  maxRetries = 3,
): Promise<void> {
  if (!url) return;

  let u: URL;
  try { u = new URL(url); } catch { return; }

  const body = JSON.stringify(record);
  const client = u.protocol === 'https:' ? httpsRequest : httpRequest;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }

    const success = await new Promise<boolean>((resolve) => {
      try {
        const req = client(
          {
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? '443' : '80'),
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode !== undefined && res.statusCode < 500);
          }
        );
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => { req.destroy(); resolve(false); });
        req.write(body);
        req.end();
      } catch {
        resolve(false);
      }
    });

    if (success) return;
  }

  console.error(`[pi-scheduler] Webhook delivery failed after ${maxRetries} attempts: ${url}`);
}
