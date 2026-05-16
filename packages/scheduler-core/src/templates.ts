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
    requiredParams: [],
  },
  {
    id: 'disk-check',
    name: 'Disk space check',
    description: 'Check available disk space every N minutes.',
    defaultInterval: 5,
    scriptType: null,
    command: "Get-PSDrive C | Select-Object Used,Free",
    script: null,
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
    requiredParams: [],
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
  };
}
