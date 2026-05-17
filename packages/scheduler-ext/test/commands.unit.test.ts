import { describe, it, expect, vi, afterEach } from 'vitest';
import { schedulerCommandHandler } from '../src/commands.js';

type MockScheduler = {
  listAutomations: () => any[];
  listTasks: () => any[];
  deleteAutomation: (id: string) => boolean;
  deleteTask: (id: string) => boolean;
  getAutomationLogs: (id: string, limit?: number) => any[];
  listTemplates: () => any[];
  getPendingSummary: () => { count: number; byAutomation: Record<string, number> };
  ackNotifications: (ts: number) => void;
};

function makeScheduler(overrides: Partial<MockScheduler> = {}): MockScheduler {
  return {
    listAutomations: () => [],
    listTasks: () => [],
    deleteAutomation: () => false,
    deleteTask: () => false,
    getAutomationLogs: () => [],
    listTemplates: () => [],
    getPendingSummary: () => ({ count: 0, byAutomation: {} }),
    ackNotifications: () => {},
    ...overrides,
  };
}

describe('schedulerCommandHandler', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    consoleSpy?.mockRestore();
    consoleSpy = undefined;
  });

  describe('notify fallback', () => {
    it('calls ctx.ui.notify when available', async () => {
      const notifyFn = vi.fn();
      const ctx = { ui: { notify: notifyFn } };
      const handler = schedulerCommandHandler(() => makeScheduler() as any);
      await handler('list', ctx as any);
      expect(notifyFn).toHaveBeenCalled();
    });

    it('falls back to console.log when ctx.ui is absent', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const handler = schedulerCommandHandler(() => makeScheduler() as any);
      await handler('list', {} as any);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[scheduler/'));
    });
  });

  describe('list subcommand', () => {
    it('shows empty message when no automations', async () => {
      const notifyFn = vi.fn();
      const handler = schedulerCommandHandler(() => makeScheduler() as any);
      await handler('list', { ui: { notify: notifyFn } } as any);
      expect(notifyFn).toHaveBeenCalledWith('No automations scheduled', 'info');
    });

    it('formats automations as a table', async () => {
      const notifyFn = vi.fn();
      const auto = {
        id: 'a1', name: 'Build', intervalMinutes: 60,
        nextRun: Date.now() + 3_600_000,
        logs: [{ exitCode: 0, time: '', stdout: '', stderr: '' }],
      };
      const handler = schedulerCommandHandler(
        () => makeScheduler({ listAutomations: () => [auto] }) as any
      );
      await handler('list', { ui: { notify: notifyFn } } as any);
      const msg: string = notifyFn.mock.calls[0][0];
      expect(msg).toContain('Build');
      expect(msg).toContain('60');
    });
  });

  describe('tasks subcommand', () => {
    it('shows empty message when no tasks', async () => {
      const notifyFn = vi.fn();
      const handler = schedulerCommandHandler(() => makeScheduler() as any);
      await handler('tasks', { ui: { notify: notifyFn } } as any);
      expect(notifyFn).toHaveBeenCalledWith('No one-shot tasks', 'info');
    });
  });

  describe('notifications subcommand', () => {
    it('shows count and breakdown when notifications are pending', async () => {
      const notifyFn = vi.fn();
      const handler = schedulerCommandHandler(
        () => makeScheduler({
          getPendingSummary: () => ({ count: 3, byAutomation: { Build: 3 } }),
        }) as any
      );
      await handler('notifications', { ui: { notify: notifyFn } } as any);
      const msg: string = notifyFn.mock.calls[0][0];
      expect(msg).toContain('3 pending');
      expect(msg).toContain('Build');
    });
  });

  describe('ack subcommand', () => {
    it('acknowledges notifications and confirms', async () => {
      const notifyFn = vi.fn();
      const ackFn = vi.fn();
      const handler = schedulerCommandHandler(
        () => makeScheduler({ ackNotifications: ackFn }) as any
      );
      await handler('ack', { ui: { notify: notifyFn } } as any);
      expect(ackFn).toHaveBeenCalled();
      expect(notifyFn).toHaveBeenCalledWith('All notifications acknowledged', 'info');
    });
  });

  describe('unknown subcommand', () => {
    it('notifies with warning level', async () => {
      const notifyFn = vi.fn();
      const handler = schedulerCommandHandler(() => makeScheduler() as any);
      await handler('foobar', { ui: { notify: notifyFn } } as any);
      expect(notifyFn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown command'),
        'warning',
      );
    });
  });
});
