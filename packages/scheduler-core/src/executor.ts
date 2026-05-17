import { spawn } from 'node:child_process';
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

// Cap per stream to avoid OOM when a command produces large output.
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024; // 4 MB

export function executeCommand(
  item: Automation | Task,
  scriptsDir: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ExecutionResult> {
  const { command, cwd } = resolveCommand(item, scriptsDir);

  return new Promise((resolve) => {
    const child = spawn(command, [], { cwd, shell: true });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutSize < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutSize += chunk.length;
        if (stdoutSize >= MAX_OUTPUT_BYTES) stdoutTruncated = true;
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrSize < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrSize += chunk.length;
        if (stderrSize >= MAX_OUTPUT_BYTES) stderrTruncated = true;
      }
    });

    function buildResult(exitCode: number): ExecutionResult {
      let stdout = Buffer.concat(stdoutChunks).toString('utf8');
      let stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (stdoutTruncated) stdout += '\n[output truncated at 4 MB]';
      if (stderrTruncated) stderr += '\n[output truncated at 4 MB]';
      return { exitCode, stdout, stderr };
    }

    function finish(exitCode: number): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(buildResult(exitCode));
    }

    // On Windows, killing the shell process may leave child processes alive
    // keeping stdio open, so 'close' never fires. Resolve immediately on
    // timeout/abort rather than waiting for the stream to close.
    const timer = setTimeout(() => {
      child.kill();
      finish(-1);
    }, timeoutMs);

    const onAbort = () => {
      child.kill();
      finish(-1);
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    child.on('close', (code) => {
      finish(code ?? -1);
    });
  });
}
