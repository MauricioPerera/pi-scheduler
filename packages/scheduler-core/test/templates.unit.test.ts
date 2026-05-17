import { describe, it, expect } from 'vitest';
import { BUILTIN_TEMPLATES, interpolateTemplate, instantiateTemplateOptions } from '../src/templates.js';

describe('Templates', () => {
  describe('BUILTIN_TEMPLATES', () => {
    it('has 14 templates', () => {
      expect(BUILTIN_TEMPLATES).toHaveLength(14);
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

    it('includes npm-test', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'npm-test');
      expect(t).toBeDefined();
      expect(t!.command).toBe('npm test');
      expect(t!.defaultInterval).toBe(30);
      expect(t!.requiredParams).toHaveLength(0);
    });

    it('includes npm-outdated', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'npm-outdated');
      expect(t).toBeDefined();
      expect(t!.command).toBe('npm outdated');
      expect(t!.defaultInterval).toBe(1440);
      expect(t!.requiredParams).toHaveLength(0);
    });

    it('includes memory-check', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'memory-check');
      expect(t).toBeDefined();
      expect(t!.command).toContain('Get-Process');
      expect(t!.defaultInterval).toBe(15);
      expect(t!.requiredParams).toHaveLength(0);
    });

    it('includes service-ping with required params', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'service-ping');
      expect(t).toBeDefined();
      expect(t!.command).toContain('Test-NetConnection');
      expect(t!.command).toContain('${host}');
      expect(t!.command).toContain('${port}');
      expect(t!.defaultInterval).toBe(5);
      expect(t!.requiredParams).toEqual(['host', 'port']);
    });

    it('includes git-log', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'git-log');
      expect(t).toBeDefined();
      expect(t!.command).toBe('git log --oneline -10');
      expect(t!.defaultInterval).toBe(60);
      expect(t!.requiredParams).toHaveLength(0);
    });

    it('includes web-screenshot with url param', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'web-screenshot');
      expect(t).toBeDefined();
      expect(t!.scriptType).toBe('javascript');
      expect(t!.script).toContain('playwright');
      expect(t!.script).toContain('screenshot');
      expect(t!.requiredParams).toEqual(['url']);
    });

    it('includes url-health-check with url param', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'url-health-check');
      expect(t).toBeDefined();
      expect(t!.scriptType).toBe('javascript');
      expect(t!.script).toContain('playwright');
      expect(t!.script).toContain('process.exit');
      expect(t!.requiredParams).toEqual(['url']);
    });

    it('includes login-flow with url param', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'login-flow');
      expect(t).toBeDefined();
      expect(t!.scriptType).toBe('javascript');
      expect(t!.script).toContain('playwright');
      expect(t!.script).toContain('PW_USERNAME');
      expect(t!.requiredParams).toEqual(['url']);
    });

    it('web-screenshot interpolates url into script', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'web-screenshot')!;
      const result = interpolateTemplate(t, { url: 'https://example.com' });
      expect(result.missing).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.script).toContain('https://example.com');
    });

    it('url-health-check reports missing url param', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'url-health-check')!;
      const result = interpolateTemplate(t, {});
      expect(result.missing).toEqual(['url']);
    });

    it('service-ping interpolates host and port', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'service-ping')!;
      const result = interpolateTemplate(t, { host: 'localhost', port: '3000' });
      expect(result.missing).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.command).toContain('localhost');
      expect(result.command).toContain('3000');
    });

    it('service-ping reports missing params', () => {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === 'service-ping')!;
      const result = interpolateTemplate(t, {});
      expect(result.missing).toEqual(['host', 'port']);
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
