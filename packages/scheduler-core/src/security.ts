import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type { TaskArgs, ValidationResult } from './types.js';

// ---------------------------------------------------------------------------
// Command Blocklist
// ---------------------------------------------------------------------------

const COMMAND_BLOCKLIST_SUBSTRINGS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'del /f /s /q',
  'rmdir /s /q',
  'format ',
  '| sh',
  '| bash',
  '| cmd',
  '| powershell',
  'shutdown /s',
  'shutdown -h',
  'reg delete',
  'remove-item -recurse',
];

const COMMAND_BLOCKLIST_WORDS = [
  'diskpart',
  'mkfs',
  'curl',
  'wget',
];

export function validateCommand(command: string | undefined): ValidationResult {
  if (!command) return { ok: true };
  const lower = command.toLowerCase().replace(/\s+/g, ' ');
  for (const pattern of COMMAND_BLOCKLIST_SUBSTRINGS) {
    if (lower.includes(pattern)) {
      return { ok: false, reason: 'Command blocked by security policy: dangerous pattern detected' };
    }
  }
  for (const word of COMMAND_BLOCKLIST_WORDS) {
    const re = new RegExp('\\b' + word + '\\b', 'i');
    if (re.test(lower)) {
      return { ok: false, reason: `Command blocked by security policy: forbidden word "${word}"` };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Script Blocklist
// ---------------------------------------------------------------------------

const SCRIPT_BLOCKLIST_SUBSTRINGS = [
  'rm -rf /',
  'rm -rf /*',
  'format ',
  'remove-item -recurse -force c:',
  'remove-item -recurse -force c:\\\\',
  'format-volume',
  'clear-disk',
  'remove-computer',
  'fs.rmsync',
  'fs.rmdirsync',
  'os.system',
  'shutil.rmtree',
  'subprocess.call',
  'dd if=/dev/zero',
  '| sh',
  '| bash',
  '| cmd',
  '| powershell',
];

const SCRIPT_BLOCKLIST_WORDS = [
  'diskpart',
  'mkfs',
  'curl',
  'wget',
  'rmsync',
  'rmdirsync',
];

export function validateScript(script: string | undefined): ValidationResult {
  if (!script) return { ok: true };
  const lower = script.toLowerCase().replace(/\s+/g, ' ');
  for (const pattern of SCRIPT_BLOCKLIST_SUBSTRINGS) {
    if (lower.includes(pattern)) {
      return { ok: false, reason: 'Script blocked by security policy: dangerous pattern detected' };
    }
  }
  for (const word of SCRIPT_BLOCKLIST_WORDS) {
    const re = new RegExp('\\b' + word + '\\b', 'i');
    if (re.test(lower)) {
      return { ok: false, reason: `Script blocked by security policy: forbidden word "${word}"` };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CWD Allowlist
// ---------------------------------------------------------------------------

const PROTECTED_CWD_PATTERNS: RegExp[] = [];

export function validateCwd(
  cwd: string | undefined,
  extraDirs: string[] = []
): ValidationResult {
  if (!cwd) return { ok: true };

  const normalized = resolve(cwd).toLowerCase();
  const userHome = resolve(homedir()).toLowerCase();

  for (const pattern of PROTECTED_CWD_PATTERNS) {
    if (pattern.test(normalized)) {
      return { ok: false, reason: `Working directory blocked by security policy: ${normalized}` };
    }
  }

  const extraAllowed = extraDirs.map((d) => resolve(d).toLowerCase());
  const allowedRoots = [
    userHome,
    resolve(userHome, '.pi').toLowerCase(),
    resolve(userHome, '.codex').toLowerCase(),
    resolve(userHome, 'documents').toLowerCase(),
    resolve(userHome, 'desktop').toLowerCase(),
    ...(process.platform === 'win32'
      ? [resolve('C:/temp').toLowerCase(), resolve('C:/tmp').toLowerCase()]
      : ['/tmp', '/var/tmp']),
    ...extraAllowed,
  ];

  const isAllowed = allowedRoots.some((root) => normalized.startsWith(root));
  if (!isAllowed) {
    return {
      ok: false,
      reason: `Working directory blocked by security policy: ${normalized}. Allowed roots: ${allowedRoots.join(', ')}`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Task Validation (aggregates all layers)
// ---------------------------------------------------------------------------

export function validateTask(args: TaskArgs, extraDirs?: string[]): ValidationResult {
  const cmdResult = validateCommand(args.command);
  if (!cmdResult.ok) return cmdResult;
  // Also apply script-level pattern checks to commands, catching inline
  // python -c / node -e / powershell -Command with dangerous code.
  const cmdInlineResult = validateScript(args.command);
  if (!cmdInlineResult.ok) return cmdInlineResult;
  const scriptResult = validateScript(args.script);
  if (!scriptResult.ok) return scriptResult;
  const cwdResult = validateCwd(args.cwd, extraDirs);
  if (!cwdResult.ok) return cwdResult;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Interpolation Hardening
// ---------------------------------------------------------------------------

const SAFE_INTERPOLATED = /^[a-zA-Z0-9_\\\\\\/: .~-]+$/;

export function validateInterpolationValue(value: unknown): ValidationResult {
  const str = String(value);
  if (!SAFE_INTERPOLATED.test(str)) {
    return { ok: false, reason: 'Interpolated value contains forbidden shell characters' };
  }
  return { ok: true };
}
