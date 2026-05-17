import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { executeCommand } from '../src/executor.js';
import type { Task } from '../src/types.js';

const SCRIPTS_DIR = tmpdir();

function makeTask(command: string, cwd = tmpdir()): Task {
  return {
    id: 'test',
    name: 'test',
    cwd,
    command,
    script: null,
    scriptType: 'javascript',
    subagentConfig: null,
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    exitCode: null,
    stdout: '',
    stderr: '',
  };
}

describe('executeCommand', () => {
  it('captures stdout and returns exitCode 0', async () => {
    const result = await executeCommand(
      makeTask('node -e "process.stdout.write(\'hello\')"'),
      SCRIPTS_DIR,
      5000,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('captures non-zero exit code', async () => {
    const result = await executeCommand(
      makeTask('node -e "process.exit(2)"'),
      SCRIPTS_DIR,
      5000,
    );
    expect(result.exitCode).toBe(2);
  });

  it('captures stderr', async () => {
    const result = await executeCommand(
      makeTask('node -e "process.stderr.write(\'oops\')"'),
      SCRIPTS_DIR,
      5000,
    );
    expect(result.stderr).toContain('oops');
  });

  it('kills process and returns exitCode -1 on timeout', async () => {
    const result = await executeCommand(
      makeTask('node -e "setTimeout(()=>{},60000)"'),
      SCRIPTS_DIR,
      300,
    );
    expect(result.exitCode).toBe(-1);
  }, 5000);

  it('kills process and returns exitCode -1 on AbortSignal', async () => {
    const controller = new AbortController();
    const promise = executeCommand(
      makeTask('node -e "setTimeout(()=>{},60000)"'),
      SCRIPTS_DIR,
      30000,
      controller.signal,
    );
    setTimeout(() => controller.abort(), 200);
    const result = await promise;
    expect(result.exitCode).toBe(-1);
  }, 5000);

  it('truncates stdout at 4 MB and appends truncation message', async () => {
    // Generate ~5 MB of output (5 * 1024 * 1024 bytes)
    const result = await executeCommand(
      makeTask('node -e "process.stdout.write(Buffer.alloc(5*1024*1024,65).toString())"'),
      SCRIPTS_DIR,
      15000,
    );
    expect(result.stdout).toContain('[output truncated at 4 MB]');
  }, 20000);

  it('returns empty stdout and stderr for a command with no output', async () => {
    const result = await executeCommand(
      makeTask('node -e ""'),
      SCRIPTS_DIR,
      5000,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
