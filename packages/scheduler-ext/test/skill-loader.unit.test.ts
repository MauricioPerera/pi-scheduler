import { describe, it, expect, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { loadSkillTemplates, parsedTemplateToCoreTemplate } from '../src/skill-loader.js';

const BASE = join(tmpdir(), `pi-ext-skill-test-${process.pid}`);
mkdirSync(BASE, { recursive: true });

afterAll(() => rmSync(BASE, { recursive: true, force: true }));

function writeSkill(dir: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf8');
  return dir;
}

describe('loadSkillTemplates', () => {
  it('returns [] when SKILL.md does not exist', () => {
    const dir = join(BASE, 'empty');
    mkdirSync(dir, { recursive: true });
    expect(loadSkillTemplates(dir)).toEqual([]);
  });

  it('parses a template with a command', () => {
    const dir = writeSkill(join(BASE, 'cmd'), `
## my-build
- **Command**: \`dotnet build\`
- **Interval**: 30 min
`);
    const templates = loadSkillTemplates(dir);
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('my-build');
    expect(templates[0].command).toBe('dotnet build');
    expect(templates[0].defaultInterval).toBe(30);
    expect(templates[0].script).toBeNull();
  });

  it('parses a template with a javascript script block', () => {
    const dir = writeSkill(join(BASE, 'script'), `
## my-script
\`\`\`javascript
console.log('hello');
\`\`\`
`);
    const templates = loadSkillTemplates(dir);
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('my-script');
    expect(templates[0].script).toContain("console.log('hello')");
    expect(templates[0].scriptType).toBe('javascript');
    expect(templates[0].command).toBeNull();
  });

  it('parses required params', () => {
    const dir = writeSkill(join(BASE, 'params'), `
## ping-host
- **Command**: \`ping \${host}\`
- **Params**: host, port
`);
    const templates = loadSkillTemplates(dir);
    expect(templates[0].requiredParams).toEqual(['host', 'port']);
  });

  it('parses multiple templates', () => {
    const dir = writeSkill(join(BASE, 'multi'), `
## build
- **Command**: \`npm run build\`

## test
- **Command**: \`npm test\`
`);
    const templates = loadSkillTemplates(dir);
    expect(templates).toHaveLength(2);
    expect(templates[0].id).toBe('build');
    expect(templates[1].id).toBe('test');
  });

  it('skips headings named "Templates" or "Template"', () => {
    const dir = writeSkill(join(BASE, 'skip'), `
## Templates

## my-task
- **Command**: \`echo hi\`
`);
    const templates = loadSkillTemplates(dir);
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('my-task');
  });
});

describe('parsedTemplateToCoreTemplate', () => {
  it('maps all fields correctly', () => {
    const parsed = {
      id: 'test-id',
      name: 'Test Id',
      description: 'echo hi',
      defaultInterval: 15,
      scriptType: 'javascript' as const,
      command: null,
      script: "console.log('hi')",
      requiredParams: ['foo'],
    };
    const core = parsedTemplateToCoreTemplate(parsed);
    expect(core.id).toBe('test-id');
    expect(core.name).toBe('Test Id');
    expect(core.description).toBe('echo hi');
    expect(core.defaultInterval).toBe(15);
    expect(core.scriptType).toBe('javascript');
    expect(core.script).toBe("console.log('hi')");
    expect(core.command).toBeNull();
    expect(core.subagentConfig).toBeNull();
    expect(core.requiredParams).toEqual(['foo']);
  });
});
