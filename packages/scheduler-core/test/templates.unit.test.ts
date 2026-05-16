import { describe, it, expect } from 'vitest';
import { BUILTIN_TEMPLATES, interpolateTemplate, instantiateTemplateOptions } from '../src/templates.js';

describe('Templates', () => {
  describe('BUILTIN_TEMPLATES', () => {
    it('has 3 templates', () => {
      expect(BUILTIN_TEMPLATES).toHaveLength(3);
    });

    it('includes build-project', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'build-project');
      expect(t).toBeDefined();
      expect(t!.command).toBe('dotnet build');
      expect(t!.defaultInterval).toBe(60);
    });

    it('includes disk-check', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'disk-check');
      expect(t).toBeDefined();
      expect(t!.command).toContain('Get-PSDrive');
      expect(t!.defaultInterval).toBe(5);
    });

    it('includes git-sync', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'git-sync');
      expect(t).toBeDefined();
      expect(t!.command).toBe('git pull');
      expect(t!.defaultInterval).toBe(30);
    });
  });

  describe('interpolateTemplate', () => {
    it('interpolates ${key} in command', () => {
      const template = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        defaultInterval: 10,
        scriptType: null as const,
        command: 'cd ${repoPath} && dotnet build',
        script: null,
        requiredParams: ['repoPath'],
      };

      const result = interpolateTemplate(template, { repoPath: 'D:/repos/my-project' });
      expect(result.missing).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.command).toBe('cd D:/repos/my-project && dotnet build');
    });

    it('detects missing required params', () => {
      const template = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        defaultInterval: 10,
        scriptType: null as const,
        command: 'cd ${repoPath}',
        script: null,
        requiredParams: ['repoPath'],
      };

      const result = interpolateTemplate(template, {});
      expect(result.missing).toContain('repoPath');
    });

    it('rejects shell metacharacters in params', () => {
      const template = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        defaultInterval: 10,
        scriptType: null as const,
        command: 'cd ${repoPath}',
        script: null,
        requiredParams: [],
      };

      const result = interpolateTemplate(template, { repoPath: 'D:/repos; rm -rf /' });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('interpolates ${key} in script', () => {
      const template = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        defaultInterval: 10,
        scriptType: 'javascript' as const,
        command: null,
        script: "console.log('${message}')",
        requiredParams: [],
      };

      const result = interpolateTemplate(template, { message: 'hello' });
      expect(result.script).toBe("console.log('hello')");
    });
  });

  describe('instantiateTemplateOptions', () => {
    it('creates options from template', () => {
      const template = BUILTIN_TEMPLATES[0]; // build-project
      const opts = instantiateTemplateOptions(template, {
        name: 'My Build',
        cwd: 'D:/repos/project',
      });

      expect(opts.name).toBe('My Build');
      expect(opts.command).toBe('dotnet build');
      expect(opts.intervalMinutes).toBe(60);
      expect(opts.cwd).toBe('D:/repos/project');
    });

    it('throws on missing required params', () => {
      const template = {
        id: 'deploy',
        name: 'Deploy',
        description: 'Deploy app',
        defaultInterval: 10,
        scriptType: null as const,
        command: 'cd ${repoPath} && deploy',
        script: null,
        requiredParams: ['repoPath'],
      };

      expect(() => instantiateTemplateOptions(template, {})).toThrow(/Missing required params/);
    });
  });
});
