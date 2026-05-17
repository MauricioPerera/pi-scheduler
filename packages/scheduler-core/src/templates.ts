import type { Template, InterpolationResult, CreateAutomationOptions } from './types.js';
import { validateInterpolationValue } from './security.js';

// ---------------------------------------------------------------------------
// Built-in Templates
// ---------------------------------------------------------------------------

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'build-project',
    name: 'Build project',
    description: 'Run dotnet build in a project directory every N minutes.',
    defaultInterval: 60,
    scriptType: null,
    command: 'dotnet build',
    script: null,
    subagentConfig: null,
    requiredParams: [],
  },
  {
    id: 'disk-check',
    name: 'Disk space check',
    description: 'Check available disk space every N minutes.',
    defaultInterval: 5,
    scriptType: null,
    command: "powershell -Command \"Get-PSDrive C | Select-Object Used,Free\"",
    script: null,
    subagentConfig: null,
    requiredParams: [],
  },
  {
    id: 'git-sync',
    name: 'Git sync',
    description: 'Pull latest changes from git remote every N minutes.',
    defaultInterval: 30,
    scriptType: null,
    command: 'git pull',
    script: null,
    subagentConfig: null,
    requiredParams: [],
  },
  {
    id: 'npm-test',
    name: 'npm test',
    description: 'Run npm test in the working directory on a schedule.',
    defaultInterval: 30,
    scriptType: null,
    command: 'npm test',
    script: null,
    subagentConfig: null,
    requiredParams: [],
  },
  {
    id: 'npm-outdated',
    name: 'Check outdated packages',
    description: 'List outdated npm packages. Exits with code 1 when outdated packages exist (expected behavior).',
    defaultInterval: 1440,
    scriptType: null,
    command: 'npm outdated',
    script: null,
    subagentConfig: null,
    requiredParams: [],
  },
  {
    id: 'memory-check',
    name: 'Memory usage check',
    description: 'List top 5 processes by memory usage.',
    defaultInterval: 15,
    scriptType: null,
    command: 'powershell -Command "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 5 -Property Name,WorkingSet"',
    script: null,
    subagentConfig: null,
    requiredParams: [],
  },
  {
    id: 'service-ping',
    name: 'Service ping',
    description: 'Check if a TCP service is reachable. Requires params: host, port.',
    defaultInterval: 5,
    scriptType: null,
    command: 'powershell -Command "Test-NetConnection -ComputerName ${host} -Port ${port}"',
    script: null,
    subagentConfig: null,
    requiredParams: ['host', 'port'],
  },
  {
    id: 'git-log',
    name: 'Git activity log',
    description: 'Log the 10 most recent commits in the working directory.',
    defaultInterval: 60,
    scriptType: null,
    command: 'git log --oneline -10',
    script: null,
    subagentConfig: null,
    requiredParams: [],
  },
  {
    id: 'nightly-review',
    name: 'Nightly code review',
    description: 'Run a reviewer subagent on uncommitted changes and open PRs every night.',
    defaultInterval: 1440,
    scriptType: null,
    command: null,
    script: null,
    subagentConfig: { agent: 'reviewer', task: 'Review all uncommitted changes and recently merged PRs. Identify issues, risks, and improvements. Be concise.' },
    requiredParams: [],
  },
  {
    id: 'daily-research',
    name: 'Daily dependency research',
    description: 'Run a researcher subagent to check for new versions of key dependencies.',
    defaultInterval: 1440,
    scriptType: null,
    command: null,
    script: null,
    subagentConfig: { agent: 'researcher', task: 'Check for new major or minor releases of the project dependencies listed in package.json. Summarize what changed and whether an upgrade is recommended.' },
    requiredParams: [],
  },
  {
    id: 'weekly-audit',
    name: 'Weekly code audit',
    description: 'Run an oracle subagent for a weekly independent code quality and drift audit.',
    defaultInterval: 10080,
    scriptType: null,
    command: null,
    script: null,
    subagentConfig: { agent: 'oracle', task: 'Audit the codebase for quality issues, architectural drift, dead code, and security concerns. Provide a prioritized list of recommendations.' },
    requiredParams: [],
  },
  // ---------------------------------------------------------------------------
  // Playwright templates (require playwright installed in cwd or globally)
  // ---------------------------------------------------------------------------
  {
    id: 'web-screenshot',
    name: 'Web screenshot',
    description: 'Navigate to a URL and save a screenshot using a real browser. Requires Playwright in cwd. Param: url (no query strings).',
    defaultInterval: 60,
    scriptType: 'javascript',
    command: null,
    script: `const { createRequire } = require('node:module');
const req = createRequire(process.cwd() + '/package.json');
const { chromium } = req('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('\${url}');
  await page.screenshot({ path: 'screenshot.png' });
  await browser.close();
  console.log('Screenshot saved to screenshot.png');
})();`,
    subagentConfig: null,
    requiredParams: ['url'],
  },
  {
    id: 'url-health-check',
    name: 'URL health check',
    description: 'Check that a URL returns HTTP < 400 using a real browser. Requires Playwright in cwd. Param: url.',
    defaultInterval: 5,
    scriptType: 'javascript',
    command: null,
    script: `const { createRequire } = require('node:module');
const req = createRequire(process.cwd() + '/package.json');
const { chromium } = req('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const response = await page.goto('\${url}');
  await browser.close();
  const status = response ? response.status() : 0;
  if (status >= 400 || status === 0) {
    console.error('Health check failed: HTTP ' + status);
    process.exit(1);
  }
  console.log('Health check passed: HTTP ' + status);
})();`,
    subagentConfig: null,
    requiredParams: ['url'],
  },
  {
    id: 'login-flow',
    name: 'Login flow check',
    description: 'Verify a login form is reachable and submittable using a real browser. Requires Playwright in cwd. Param: url. Credentials via PW_USERNAME / PW_PASSWORD env vars.',
    defaultInterval: 30,
    scriptType: 'javascript',
    command: null,
    script: `if (!process.env.PW_USERNAME || !process.env.PW_PASSWORD) {
  console.error('Missing credentials: set PW_USERNAME and PW_PASSWORD environment variables.');
  process.exit(1);
}
const { createRequire } = require('node:module');
const req = createRequire(process.cwd() + '/package.json');
const { chromium } = req('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('\${url}');
  await page.fill('[name="username"], [name="email"], input[type="email"]', process.env.PW_USERNAME);
  await page.fill('[name="password"], input[type="password"]', process.env.PW_PASSWORD);
  await page.click('[type="submit"]');
  await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
  const title = await page.title();
  console.log('Login flow completed. Page: ' + title);
  await browser.close();
})();`,
    subagentConfig: null,
    requiredParams: ['url'],
  },
];

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

export function interpolateTemplate(template: Template, params: Record<string, string> = {}): InterpolationResult {
  let command = template.command;
  let script = template.script;
  const missing: string[] = [];
  const errors: string[] = [];

  // Check required params
  if (template.requiredParams && Array.isArray(template.requiredParams)) {
    for (const key of template.requiredParams) {
      if (params[key] === undefined) {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    return { command, script, missing, errors };
  }

  // Interpolate
  for (const [key, value] of Object.entries(params)) {
    const check = validateInterpolationValue(value);
    if (!check.ok) {
      errors.push(`param "${key}": ${check.reason}`);
      continue;
    }
    const placeholder = '${' + key + '}';
    if (command) command = command.split(placeholder).join(String(value));
    if (script) script = script.split(placeholder).join(String(value));
  }

  return { command, script, missing, errors };
}

// ---------------------------------------------------------------------------
// Template Instantiation
// ---------------------------------------------------------------------------

export function instantiateTemplateOptions(
  template: Template,
  options: { name?: string; intervalMinutes?: number; cwd?: string; params?: Record<string, string> }
): CreateAutomationOptions {
  const interp = interpolateTemplate(template, options.params ?? {});

  if (interp.missing.length > 0) {
    throw new Error(`Missing required params: ${interp.missing.join(', ')}`);
  }
  if (interp.errors.length > 0) {
    throw new Error(`Interpolation errors: ${interp.errors.join('; ')}`);
  }

  return {
    name: options.name ?? template.name,
    intervalMinutes: options.intervalMinutes ?? template.defaultInterval,
    cwd: options.cwd,
    command: interp.command ?? undefined,
    script: interp.script ?? undefined,
    scriptType: template.scriptType ?? 'javascript',
    subagentConfig: template.subagentConfig ?? undefined,
  };
}
