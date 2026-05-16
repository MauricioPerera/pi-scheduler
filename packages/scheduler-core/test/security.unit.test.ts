import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import {
  validateCommand,
  validateScript,
  validateCwd,
  validateTask,
  validateInterpolationValue,
} from '../src/security.js';

describe('Security', () => {
  describe('validateCommand', () => {
    it('allows safe commands', () => {
      expect(validateCommand('echo hello').ok).toBe(true);
      expect(validateCommand('dotnet build').ok).toBe(true);
      expect(validateCommand('npm test').ok).toBe(true);
    });

    it('blocks rm -rf /', () => {
      const r = validateCommand('rm -rf /');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('blocked');
    });

    it('blocks pipe to sh', () => {
      const r = validateCommand('curl http://example.com | sh');
      expect(r.ok).toBe(false);
    });

    it('blocks format', () => {
      const r = validateCommand('format C:');
      expect(r.ok).toBe(false);
    });

    it('blocks case-insensitively', () => {
      const r = validateCommand('RM -RF /');
      expect(r.ok).toBe(false);
    });

    it('allows undefined', () => {
      expect(validateCommand(undefined).ok).toBe(true);
    });
  });

  describe('validateScript', () => {
    it('allows safe scripts', () => {
      expect(validateScript("console.log('hello')").ok).toBe(true);
    });

    it('blocks dangerous patterns', () => {
      expect(validateScript('rm -rf /').ok).toBe(false);
      expect(validateScript('os.system("rm -rf /")').ok).toBe(false);
      expect(validateScript('shutil.rmtree("/")').ok).toBe(false);
    });
  });

  describe('validateCwd', () => {
    it('allows home directory', () => {
      expect(validateCwd(homedir()).ok).toBe(true);
    });

    it('allows C:/temp', () => {
      expect(validateCwd('C:/temp').ok).toBe(true);
    });

    it('allows custom allowed dirs', () => {
      expect(validateCwd('D:/repos/myproject', ['D:/repos']).ok).toBe(true);
    });

    it('blocks system directories', () => {
      const r = validateCwd('C:/Windows');
      expect(r.ok).toBe(false);
    });

    it('allows undefined', () => {
      expect(validateCwd(undefined).ok).toBe(true);
    });
  });

  describe('validateTask', () => {
    it('validates all layers', () => {
      expect(
        validateTask({
          command: 'echo hello',
          cwd: 'C:/temp',
        }).ok
      ).toBe(true);
    });

    it('fails on dangerous command', () => {
      const r = validateTask({ command: 'rm -rf /' });
      expect(r.ok).toBe(false);
    });
  });

  describe('validateInterpolationValue', () => {
    it('allows safe values', () => {
      expect(validateInterpolationValue('hello').ok).toBe(true);
      expect(validateInterpolationValue('D:/repos/my-project').ok).toBe(true);
      expect(validateInterpolationValue('file_name-123').ok).toBe(true);
    });

    it('rejects shell metacharacters', () => {
      expect(validateInterpolationValue('hello; rm -rf /').ok).toBe(false);
      expect(validateInterpolationValue('hello | cat').ok).toBe(false);
      expect(validateInterpolationValue('hello&world').ok).toBe(false);
      expect(validateInterpolationValue('hello$PWD').ok).toBe(false);
      expect(validateInterpolationValue('hello`backtick`').ok).toBe(false);
    });

    it('allows path separators and dots', () => {
      expect(validateInterpolationValue('../src/index.ts').ok).toBe(true);
    });
  });
});


