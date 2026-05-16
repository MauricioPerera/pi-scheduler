declare module '@sinclair/typebox' {
  export const Type: {
    String: (opts?: any) => any;
    Number: (opts?: any) => any;
    Literal: (value: any) => any;
    Union: (items: any[]) => any;
    Object: (props: any) => any;
    Optional: (item: any) => any;
  };
  export type Static<T> = any;
}

declare module '@earendil-works/pi-coding-agent' {
  export interface ToolDefinition {
    name: string;
    label?: string;
    description?: string;
    parameters?: any;
    execute: (toolCallId: string, params: any) => Promise<any> | any;
  }
  export interface ExtensionFactory {
    (api: any): Promise<void> | void;
  }
  export interface ExtensionContext {
    cwd: string;
    hasUI: boolean;
    ui: {
      notify: (message: string, level?: 'info' | 'warning' | 'error') => Promise<void>;
      confirm: (title: string, message: string, opts?: any) => Promise<boolean>;
    };
  }
  export interface ExtensionCommandContext {
    ui?: {
      notify?: (message: string, level?: string) => Promise<void>;
      confirm?: (title: string, message: string, opts?: any) => Promise<boolean>;
    };
  }
}
