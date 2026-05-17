import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import type { SubagentConfig, SubagentExecutor } from 'pi-scheduler-core';

// ---------------------------------------------------------------------------
// Built-in agent role descriptions
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
// Frontmatter parser — handles the YAML block that pi uses in .md agent files
// ---------------------------------------------------------------------------

function parseMdFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  if (!content.startsWith('---\n')) return { frontmatter: {}, body: content };
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return { frontmatter: {}, body: content };
  const fm = content.slice(4, end);
  const body = content.slice(end + 5);
  const frontmatter: Record<string, string> = {};
  for (const line of fm.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) frontmatter[key] = value;
  }
  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Agent config
// ---------------------------------------------------------------------------

interface AgentConfig {
  systemPrompt: string;
  model?: string;
  tools?: string[];
}

function resolveAgent(agentName: string, projectAgentsDir?: string): AgentConfig {
  const dirs: string[] = [];
  if (projectAgentsDir) dirs.push(projectAgentsDir);
  dirs.push(join(homedir(), '.pi', 'agent', 'agents'));

  for (const dir of dirs) {
    // 1. .md file — standard pi format with frontmatter
    const mdPath = join(dir, `${agentName}.md`);
    if (existsSync(mdPath)) {
      try {
        const content = readFileSync(mdPath, 'utf8');
        const { frontmatter, body } = parseMdFrontmatter(content);
        const tools = frontmatter.tools
          ? frontmatter.tools.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined;
        return {
          systemPrompt: body.trim() || (BUILTIN_ROLES[agentName] ?? `You are a ${agentName} agent.`),
          model: frontmatter.model || undefined,
          tools: tools && tools.length > 0 ? tools : undefined,
        };
      } catch { /* fall through */ }
    }

    // 2. .json file — legacy format
    const jsonPath = join(dir, `${agentName}.json`);
    if (existsSync(jsonPath)) {
      try {
        const cfg = JSON.parse(readFileSync(jsonPath, 'utf8'));
        return {
          systemPrompt: typeof cfg.systemPrompt === 'string'
            ? cfg.systemPrompt
            : (BUILTIN_ROLES[agentName] ?? `You are a ${agentName} agent.`),
          model: typeof cfg.model === 'string' ? cfg.model : undefined,
          tools: Array.isArray(cfg.tools) ? cfg.tools : undefined,
        };
      } catch { /* fall through */ }
    }
  }

  // 3. Built-in fallback
  return {
    systemPrompt: BUILTIN_ROLES[agentName] ?? `You are a ${agentName} agent. Complete the task as described.`,
  };
}

// ---------------------------------------------------------------------------
// Temp file helper — avoids Windows command-line length limits for long prompts
// ---------------------------------------------------------------------------

interface TempFile { dir: string; path: string }

function writeTempPrompt(agentName: string, content: string): TempFile | null {
  if (!content.trim()) return null;
  try {
    const dir = mkdtempSync(join(tmpdir(), 'pi-scheduler-'));
    const filePath = join(dir, `prompt-${agentName.replace(/[^\w.-]/g, '_')}.md`);
    writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
    return { dir, path: filePath };
  } catch { return null; }
}

function cleanupTempFile(tmp: TempFile | null): void {
  if (!tmp) return;
  try { unlinkSync(tmp.path); } catch { /* ignore */ }
  try { rmdirSync(tmp.dir); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Spawn helper (4 MB stream cap, settled flag safe on Windows)
// ---------------------------------------------------------------------------

const MAX_STREAM_BYTES = 4 * 1024 * 1024;

function spawnClaude(
  args: string[],
  cwd: string,
  timeoutMs: number,
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
    child.on('error', (err) => {
      const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
      stderrBuf = isNotFound
        ? 'claude CLI not found in PATH. Install with: npm install -g @anthropic-ai/claude-code'
        : String(err);
      finish(-1);
    });

    const timer = setTimeout(() => { child.kill(); finish(-1); }, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Single-agent execution
// ---------------------------------------------------------------------------

async function runSingleAgent(
  agentName: string,
  task: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const agent = resolveAgent(agentName, findProjectAgentsDir(cwd));

  const args: string[] = ['-p', '--no-session'];
  if (agent.model) args.push('--model', agent.model);
  if (agent.tools && agent.tools.length > 0) args.push('--allowedTools', agent.tools.join(','));

  // Write system prompt to a temp file to avoid Windows arg-length limits
  const tmp = writeTempPrompt(agentName, agent.systemPrompt);
  if (tmp) {
    args.push('--system-prompt', tmp.path);
  }

  args.push(task);

  try {
    return await spawnClaude(args, cwd, timeoutMs);
  } finally {
    cleanupTempFile(tmp);
  }
}

// ---------------------------------------------------------------------------
// Project-local agent discovery — looks for .pi/agents/ climbing up from cwd
// ---------------------------------------------------------------------------

function findProjectAgentsDir(cwd: string): string | undefined {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, '.pi', 'agents');
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, '..');
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// ---------------------------------------------------------------------------
// Chain execution — each step receives previous output as context
// ---------------------------------------------------------------------------

async function runChain(
  chain: Array<{ agent: string; task: string }>,
  cwd: string,
  timeoutMs: number,
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
