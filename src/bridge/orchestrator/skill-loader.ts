import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export class SkillLoader {
  private cache = new Map<string, string>();

  /** Search paths for skill files — ordered by priority. */
  private findSkillPath(skillName: string): string | null {
    // Remove vmt- prefix for filesystem lookup
    const cleanName = skillName.replace(/^vmt-/, '');

    const searchPaths = [
      // 1. User-installed skills (~/.claude/skills/)
      path.join(os.homedir(), '.claude', 'skills', skillName, 'SKILL.md'),
      // 2. VMT skills (src/skills/vmt/ — recursive)
      ...this.findInDir(path.join(process.cwd(), 'src', 'skills', 'vmt'), cleanName),
      // 3. Built-in skills (src/skills/)
      path.join(process.cwd(), 'src', 'skills', skillName, 'SKILL.md'),
    ];

    for (const p of searchPaths) {
      if (p && fs.existsSync(p)) return p;
    }
    return null;
  }

  /** Recursively search a directory for a skill file matching the name. */
  private findInDir(dir: string, name: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Check if this directory contains SKILL.md
          const md = path.join(full, 'SKILL.md');
          if (fs.existsSync(md)) {
            const dirName = path.basename(full);
            if (dirName === name) results.push(md);
          }
          // Recurse
          results.push(...this.findInDir(full, name));
        }
      }
    } catch { /* ignore */ }
    return results;
  }

  load(skillName: string): string {
    if (this.cache.has(skillName)) {
      return this.cache.get(skillName)!;
    }

    const skillPath = this.findSkillPath(skillName);
    if (skillPath) {
      const content = fs.readFileSync(skillPath, 'utf-8');
      this.cache.set(skillName, content);
      return content;
    }

    // Fallback: try old path for backward compatibility
    const legacyDir = path.join(os.homedir(), '.claude', 'skills', skillName);
    if (fs.existsSync(legacyDir)) {
      try {
        const files = fs.readdirSync(legacyDir).filter((f) => f.endsWith('.md'));
        if (files.length > 0) {
          const content = fs.readFileSync(path.join(legacyDir, files[0]), 'utf-8');
          this.cache.set(skillName, content);
          return content;
        }
      } catch { /* ignore */ }
    }

    return `[技能 ${skillName} 的文件未找到]`;
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
