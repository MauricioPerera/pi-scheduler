import { exec } from 'node:child_process';
import type { Automation, Task } from './types.js';
import { resolveCommand } from './store.js';

// ---------------------------------------------------------------------------
// Execute Command
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function executeCommand(
  item: Automation | Task,
  scriptsDir: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ExecutionResult> {
  const { command, cwd } = resolveCommand(item, scriptsDir);

  return new Promise((resolve) => {
    const child = exec(command, { cwd, timeout: timeoutMs }, (error, stdout, stderr) => {
      const exitCode = error ? (error.code ?? -1) : 0;
      resolve({
        exitCode,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
      });
    });

    if (signal) {
      const onAbort = () => {
        child.kill();
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
  });
}
