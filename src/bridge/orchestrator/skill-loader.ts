import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export class SkillLoader {
  private cache = new Map<string, string>();

  load(skillName: string): string {
    if (this.cache.has(skillName)) {
      return this.cache.get(skillName)!;
    }

    const skillDir = path.join(os.homedir(), '.claude', 'skills', skillName);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      try {
        const files = fs.readdirSync(skillDir).filter((f) => f.endsWith('.md'));
        if (files.length > 0) {
          const content = fs.readFileSync(path.join(skillDir, files[0]), 'utf-8');
          this.cache.set(skillName, content);
          return content;
        }
      } catch {
        // dir doesn't exist
      }
      return `[技能 ${skillName} 的文件未找到]`;
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    this.cache.set(skillName, content);
    return content;
  }

  preload(skillNames: string[]): void {
    for (const name of skillNames) {
      try {
        this.load(name);
      } catch {
        /* ignore */
      }
    }
  }
}
