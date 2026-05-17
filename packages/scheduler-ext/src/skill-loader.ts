import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Template } from 'pi-scheduler-core';

// ---------------------------------------------------------------------------
// Skill Template Loader
// ---------------------------------------------------------------------------
// Parses SKILL.md markdown looking for template definitions.
//
// Expected format:
// ## template-id
// - **Comando**: `dotnet build`
// - **Intervalo**: 60 min
// - **Params**: `repoPath` (opcional)
//
// Or inline code blocks:
// ## template-id
// ```javascript
// console.log('hello')
// ```

export interface ParsedTemplate {
  id: string;
  name: string;
  description: string;
  defaultInterval: number;
  scriptType: 'javascript' | 'python' | 'powershell' | null;
  command: string | null;
  script: string | null;
  requiredParams: string[];
}

export function loadSkillTemplates(skillDir: string): ParsedTemplate[] {
  const skillFile = join(skillDir, 'SKILL.md');
  if (!existsSync(skillFile)) return [];

  try {
    const content = readFileSync(skillFile, 'utf8');
    return parseSkillMarkdown(content);
  } catch {
    return [];
  }
}

function parseSkillMarkdown(content: string): ParsedTemplate[] {
  const templates: ParsedTemplate[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for ## heading
    if (line.startsWith('## ') && !line.startsWith('## Templates') && !line.startsWith('## Template')) {
      const id = line.slice(3).trim().toLowerCase().replace(/\s+/g, '-');
      let name = id;
      let description = '';
      let defaultInterval = 60;
      let command: string | null = null;
      let script: string | null = null;
      let scriptType: ParsedTemplate['scriptType'] = null;
      let requiredParams: string[] = [];

      i++;
      // Parse bullet list until next heading or code block end
      while (i < lines.length) {
        const l = lines[i];
        const trimmed = l.trim();

        if (trimmed.startsWith('#')) break;

        if (trimmed.startsWith('- **')) {
          const match = trimmed.match(/^- \*\*(\w+)\*\*:\s*`?([^`]+)`?/);
          if (match) {
            const key = match[1].toLowerCase();
            const value = match[2].trim();
            if (key === 'comando' || key === 'command') command = value;
            if (key === 'intervalo' || key === 'interval') {
              const num = parseInt(value, 10);
              if (!isNaN(num)) defaultInterval = num;
            }
            if (key === 'params') {
              const params = value.split(',').map((p) => p.trim().replace(/\s*\(.*\)$/, ''));
              requiredParams = params.filter((p) => p.length > 0);
            }
          }
        }

        // Code block
        if (trimmed.startsWith('```')) {
          const lang = trimmed.slice(3).trim();
          if (lang === 'javascript' || lang === 'python' || lang === 'powershell') {
            scriptType = lang;
          }
          i++;
          const codeLines: string[] = [];
          while (i < lines.length && !lines[i].trim().startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          script = codeLines.join('\n');
          if (!scriptType) scriptType = 'javascript';
          i++; // skip ```
          continue;
        }

        i++;
      }

      // Infer name from id if not explicitly set
      name = id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      description = command ?? script ?? 'Custom template';

      templates.push({
        id,
        name,
        description,
        defaultInterval,
        scriptType,
        command,
        script,
        requiredParams,
      });
      continue;
    }

    i++;
  }

  return templates;
}

export function parsedTemplateToCoreTemplate(parsed: ParsedTemplate): Template {
  return {
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    defaultInterval: parsed.defaultInterval,
    scriptType: parsed.scriptType,
    command: parsed.command,
    script: parsed.script,
    subagentConfig: null,
    requiredParams: parsed.requiredParams,
  };
}
