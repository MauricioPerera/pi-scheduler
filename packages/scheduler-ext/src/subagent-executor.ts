import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SubagentConfig, SubagentExecutor } from 'pi-scheduler-core';

// ---------------------------------------------------------------------------
// Built-in agent role descriptions (mirrors pi-subagents built-ins)
// ---------------------------------------------------------------------------

const BUILTIN_ROLES: Record<string, string> = {
  scout: 'You are a code reconnaissance specialist. Map the codebase structure, entry points, key dependencies, and data flow. Be thorough but concise.',
  researcher: 'You are a research specialist. Investigate the given topic, gather relevant information, and provide findings with clear sources and actionable takeaways.',
  planner: 'You are a planning specialist. Analyze the situation and produce a concrete, step-by-step implementation plan with clear deliverables.',
  worker: 'You are an implementation specialist. Implement the requested changes carefully, following existing conventions. When blocked on a decision, make a reasonable choice and document it.',
  reviewer: 'You are a code review specialist. Review the provided code or changes for correctness, security, performance, and maintainability. Provide a prioritized list of findings.',
  oracle: 'You are a second-opinion specialist. Provide an independent, critical assessment. Identify assumptions, risks, and blind spots the primary agent may have missed.',
  'context-builder': 'You are a documentation specialist. Generate structured, accurate context files that summarize the codebase or subsystem for future agent consumption.',
};

// ---------------------------------------------------------------------------
// Agent config loader (reads from ~/.pi/agent/agents/ if present)
// ---------------------------------------------------------------------------

function resolveSystemPrompt(agentName: string): string {
  const configPath = join(homedir(), '.pi', 'agent', 'agents', `${agentName}.json`);
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      if (typeof cfg.systemPrompt === 'string') return cfg.systemPrompt;
    } catch {}
  }
  return BUILTIN_ROLES[agentName] ?? `You are a ${agentName} agent. Complete the task as described.`;
}

// ---------------------------------------------------------------------------
// Spawn helper (4 MB per stream cap, Windows-safe settled flag)
// ---------------------------------------------------------------------------

const MAX_STREAM_BYTES = 4 * 1024 * 1024;

function spawnClaude(
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, shell: false });
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    function finish(exitCode: number): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout: stdoutBuf, stderr: stderrBuf });
    }

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutBuf.length < MAX_STREAM_BYTES) {
        stdoutBuf += chunk.toString();
        if (stdoutBuf.length > MAX_STREAM_BYTES) stdoutBuf = stdoutBuf.slice(0, MAX_STREAM_BYTES);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBuf.length < MAX_STREAM_BYTES) {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > MAX_STREAM_BYTES) stderrBuf = stderrBuf.slice(0, MAX_STREAM_BYTES);
      }
    });

    child.on('close', (code) => finish(code ?? -1));
    child.on('error', () => finish(-1));

    const timer = setTimeout(() => { child.kill(); finish(-1); }, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Single-agent execution
// ---------------------------------------------------------------------------

async function runSingleAgent(
  agent: string,
  task: string,
  cwd: string,
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const systemPrompt = resolveSystemPrompt(agent);
  return spawnClaude(['--system-prompt', systemPrompt, '-p', task], cwd, timeoutMs);
}

// ---------------------------------------------------------------------------
// Chain execution — each step gets previous output as context
// ---------------------------------------------------------------------------

async function runChain(
  chain: Array<{ agent: string; task: string }>,
  cwd: string,
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let previousOutput = '';
  let lastResult = { exitCode: 0, stdout: '', stderr: '' };

  for (const step of chain) {
    const task = previousOutput
      ? `${step.task}\n\nContext from previous step:\n${previousOutput}`
      : step.task;

    lastResult = await runSingleAgent(step.agent, task, cwd, timeoutMs);
    if (lastResult.exitCode !== 0) break;
    previousOutput = lastResult.stdout;
  }

  return lastResult;
}

// ---------------------------------------------------------------------------
// Exported executor factory
// ---------------------------------------------------------------------------

export function createSubagentExecutor(timeoutMs = 300000): SubagentExecutor {
  return async (config: SubagentConfig, cwd: string) => {
    if (config.chain && config.chain.length > 0) {
      return runChain(config.chain, cwd, timeoutMs);
    }
    const agent = config.agent ?? 'worker';
    return runSingleAgent(agent, config.task, cwd, timeoutMs);
  };
}
