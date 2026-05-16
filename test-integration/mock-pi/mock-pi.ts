// ---------------------------------------------------------------------------
// Minimal mock of pi ExtensionAPI for testing scheduler-ext
// ---------------------------------------------------------------------------

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
  ToolDefinition,
  ExtensionHandler,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

export interface MockNotification {
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: number;
}

export class MockExtensionUIContext implements ExtensionUIContext {
  notifications: MockNotification[] = [];

  async select(title: string, options: string[]): Promise<string | undefined> {
    return options[0];
  }

  async confirm(title: string, message: string): Promise<boolean> {
    return true;
  }

  async input(title: string, placeholder?: string): Promise<string | undefined> {
    return 'mock-input';
  }

  notify(message: string, type?: 'info' | 'warning' | 'error'): void {
    this.notifications.push({ message, type: type ?? 'info', timestamp: Date.now() });
    console.log(`[UI:${type ?? 'info'}] ${message}`);
  }
}

export class MockExtensionContext implements ExtensionContext {
  ui = new MockExtensionUIContext();
  hasUI = true;
  cwd = process.cwd();
  isIdle = () => true;
  signal = undefined;
  abort = () => {};
  hasPendingMessages = () => false;
  shutdown = () => {};
  getContextUsage = () => undefined;
  compact = () => {};
  getSystemPrompt = () => '';
}

export class MockExtensionCommandContext extends MockExtensionContext {
  async waitForIdle(): Promise<void> {}
}

export class MockExtensionAPI implements ExtensionAPI {
  tools: ToolDefinition[] = [];
  commands: Array<{ name: string; options: any }> = [];
  eventHandlers: Map<string, ExtensionHandler<any>[]> = new Map();

  registerTool(tool: ToolDefinition): void {
    this.tools.push(tool);
    console.log(`[MockPI] Tool registered: ${tool.name}`);
  }

  registerCommand(name: string, options: any): void {
    this.commands.push({ name, options });
    console.log(`[MockPI] Command registered: ${name}`);
  }

  on<E = any>(event: string, handler: ExtensionHandler<E>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  async emitEvent(event: string, payload: any): Promise<void> {
    const handlers = this.eventHandlers.get(event) || [];
    const ctx = new MockExtensionContext();
    for (const handler of handlers) {
      try {
        await handler(payload, ctx);
      } catch (err) {
        console.error(`[MockPI] Event handler error for ${event}:`, err);
      }
    }
  }

  getTools(): ToolDefinition[] {
    return this.tools;
  }

  getCommands(): Array<{ name: string; options: any }> {
    return this.commands;
  }

  getEventHandlers(event: string): ExtensionHandler<any>[] {
    return this.eventHandlers.get(event) || [];
  }
}
