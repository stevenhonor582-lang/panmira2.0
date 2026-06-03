import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { execFileSync } from 'node:child_process';
import type { Logger } from '../utils/logger.js';
import { SKILL_REGISTRY } from '../skills/skill-registry.js';

/** Skills installed for all platforms. */
const COMMON_SKILLS = ['metaskill', 'metamemory', 'panmira', 'phone-call', 'skill-hub'];

/** Lark CLI AI Agent skills — installed via `npx skills add larksuite/cli` and
 *  symlinked into ~/.claude/skills/ automatically. We copy them to the bot
 *  working directory so they are available in the Claude Code session. */
const LARK_CLI_SKILLS = [
  'lark-base',
  'lark-calendar',
  'lark-contact',
  'lark-doc',
  'lark-drive',
  'lark-event',
  'lark-im',
  'lark-mail',
  'lark-minutes',
  'lark-openapi-explorer',
  'lark-shared',
  'lark-sheets',
  'lark-skill-maker',
  'lark-task',
  'lark-vc',
  'lark-whiteboard',
  'lark-wiki',
  'lark-workflow-meeting-summary',
  'lark-workflow-standup-report',
];

export interface InstallSkillsOptions {
  /** Bot platform — feishu-only skills are skipped for other platforms. */
  platform?: 'feishu' | 'telegram' | 'web' | 'wechat';
  /** Feishu app credentials for lark-cli auto-config (feishu only). */
  feishuAppId?: string;
  feishuAppSecret?: string;
}

export function installSkillsToWorkDir(workDir: string, logger: Logger, options?: InstallSkillsOptions): void {
  const userSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  const destSkillsDir = path.join(workDir, '.claude', 'skills');

  const skillNames = options?.platform === 'feishu' ? [...COMMON_SKILLS, ...LARK_CLI_SKILLS] : COMMON_SKILLS;

  for (const skill of skillNames) {
    const src = path.join(userSkillsDir, skill);

    if (!fs.existsSync(src)) {
      logger.debug({ skill }, 'Skill source not found, skipping');
      continue;
    }

    const dest = path.join(destSkillsDir, skill);
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    logger.info({ skill, src, dest }, 'Skill installed to working directory');
  }

  // For Feishu bots, ensure lark-cli is configured
  if (options?.platform === 'feishu' && options.feishuAppId && options.feishuAppSecret) {
    ensureLarkCliConfig(options.feishuAppId, options.feishuAppSecret, logger);
  }

  // Deploy workspace CLAUDE.md if not already present
  const destClaudeMd = path.join(workDir, 'CLAUDE.md');
  if (!fs.existsSync(destClaudeMd)) {
    const thisFile = url.fileURLToPath(import.meta.url);
    const thisDir = path.dirname(thisFile);
    // Try src/workspace/CLAUDE.md (tsx) or dist/workspace/CLAUDE.md (compiled)
    for (const candidate of [
      path.join(thisDir, '..', 'workspace', 'CLAUDE.md'),
      path.join(thisDir, '..', '..', 'src', 'workspace', 'CLAUDE.md'),
    ]) {
      if (fs.existsSync(candidate)) {
        fs.copyFileSync(candidate, destClaudeMd);
        logger.info({ dest: destClaudeMd }, 'CLAUDE.md deployed to working directory');
        break;
      }
    }
  }
}

/**
 * Ensure lark-cli is configured with Feishu app credentials.
 * Skips if ~/.lark-cli/config.json already exists.
 */
function ensureLarkCliConfig(appId: string, appSecret: string, logger: Logger): void {
  const configPath = path.join(os.homedir(), '.lark-cli', 'config.json');
  if (fs.existsSync(configPath)) {
    logger.debug('lark-cli already configured, skipping');
    return;
  }

  // Find lark-cli binary
  const larkCliBin = findLarkCli();
  if (!larkCliBin) {
    logger.warn(
      'lark-cli not found in PATH or ~/.npm-global/bin — skipping config. Run: npm install -g @larksuite/cli',
    );
    return;
  }

  try {
    execFileSync(larkCliBin, ['config', 'init', '--app-id', appId, '--app-secret-stdin', '--brand', 'feishu'], {
      input: appSecret,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
    });
    logger.info({ appId }, 'lark-cli configured successfully');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to configure lark-cli — you can run manually: lark-cli config init');
  }
}

/**
 * Install a skill from the Skill Hub into a bot's working directory.
 * Writes SKILL.md and optionally extracts references/ from a tar buffer.
 */
export function installSkillFromHub(
  workDir: string,
  skillName: string,
  skillMd: string,
  referencesTar: Buffer | undefined,
  logger: Logger,
): void {
  const destDir = path.join(workDir, '.claude', 'skills', skillName);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, 'SKILL.md'), skillMd, 'utf-8');

  if (referencesTar && referencesTar.length > 0) {
    try {
      execFileSync('tar', ['xf', '-', '-C', destDir], {
        input: referencesTar,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
    } catch (err: any) {
      logger.warn({ err: err.message, skillName }, 'Failed to extract references tar');
    }
  }

  // Also sync to staging so deploySelectedSkills() can find it on future queries
  const stagingDir = path.join(workDir, '.claude', 'skills-staging', skillName);
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.cpSync(destDir, stagingDir, { recursive: true });
    logger.info({ skillName, stagingDest: stagingDir }, 'Skill synced to staging');
  } catch (err: any) {
    logger.warn({ err: err.message, skillName }, 'Failed to sync skill to staging');
  }

  logger.info({ skillName, dest: destDir }, 'Skill installed from Hub');
}

/**
 * Install ALL skills to a staging area (.claude/skills-staging/) and
 * only deploy always-load skills to the active .claude/skills/ directory.
 * Dynamic skills are deployed at execution time by `deploySelectedSkills()`.
 */
export function installSkillsWithStaging(workDir: string, logger: Logger, options?: InstallSkillsOptions): void {
  const userSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  const stagingDir = path.join(workDir, '.claude', 'skills-staging');
  const activeDir = path.join(workDir, '.claude', 'skills');

  const platform = options?.platform === 'feishu' ? 'feishu' : 'all';
  const allSkills = SKILL_REGISTRY.filter((s) => s.platform === 'all' || s.platform === platform);

  // Stage all skills
  for (const skill of allSkills) {
    const src = path.join(userSkillsDir, skill.name);
    if (!fs.existsSync(src)) {
      logger.debug({ skill: skill.name }, 'Skill source not found, skipping');
      continue;
    }
    const stagingDest = path.join(stagingDir, skill.name);
    fs.mkdirSync(stagingDest, { recursive: true });
    fs.cpSync(src, stagingDest, { recursive: true });
  }
  logger.info({ platform, stagedCount: allSkills.length }, 'All skills staged');

  // Deploy only always-load skills to active directory
  const alwaysLoad = allSkills.filter((s) => s.alwaysLoad);
  for (const skill of alwaysLoad) {
    const stagingSrc = path.join(stagingDir, skill.name);
    if (!fs.existsSync(stagingSrc)) continue;
    const activeDest = path.join(activeDir, skill.name);
    fs.mkdirSync(activeDest, { recursive: true });
    fs.cpSync(stagingSrc, activeDest, { recursive: true });
  }
  logger.info({ alwaysLoadCount: alwaysLoad.length }, 'Always-load skills deployed');

  // Deploy workspace CLAUDE.md if not already present
  const destClaudeMd = path.join(workDir, 'CLAUDE.md');
  if (!fs.existsSync(destClaudeMd)) {
    const thisFile = url.fileURLToPath(import.meta.url);
    const thisDir = path.dirname(thisFile);
    for (const candidate of [
      path.join(thisDir, '..', 'workspace', 'CLAUDE.md'),
      path.join(thisDir, '..', '..', 'src', 'workspace', 'CLAUDE.md'),
    ]) {
      if (fs.existsSync(candidate)) {
        fs.copyFileSync(candidate, destClaudeMd);
        logger.info({ dest: destClaudeMd }, 'CLAUDE.md deployed');
        break;
      }
    }
  }

  // Feishu lark-cli config
  if (options?.platform === 'feishu' && options.feishuAppId && options.feishuAppSecret) {
    ensureLarkCliConfig(options.feishuAppId, options.feishuAppSecret, logger);
  }
}

/**
 * Deploy selected skills from staging to active directory for execution.
 * Removes previously deployed dynamic skills first, then copies new ones.
 */
export function deploySelectedSkills(workDir: string, selectedSkillNames: string[], logger: Logger): void {
  const stagingDir = path.join(workDir, '.claude', 'skills-staging');
  const activeDir = path.join(workDir, '.claude', 'skills');
  const userSkillsDir = path.join(os.homedir(), '.claude', 'skills');

  const alwaysLoadNames = new Set(SKILL_REGISTRY.filter((s) => s.alwaysLoad).map((s) => s.name));

  // Remove dynamic skills from active dir (keep always-load ones)
  if (fs.existsSync(activeDir)) {
    for (const entry of fs.readdirSync(activeDir)) {
      if (!alwaysLoadNames.has(entry)) {
        fs.rmSync(path.join(activeDir, entry), { recursive: true, force: true });
      }
    }
  }

  // Deploy selected dynamic skills — check staging first, then user-level
  let deployed = 0;
  for (const name of selectedSkillNames) {
    if (alwaysLoadNames.has(name)) continue; // already deployed

    const stagingSrc = path.join(stagingDir, name);
    const userSrc = path.join(userSkillsDir, name);
    const src = fs.existsSync(stagingSrc) ? stagingSrc : fs.existsSync(userSrc) ? userSrc : null;
    if (!src) continue;

    const activeDest = path.join(activeDir, name);
    fs.mkdirSync(activeDest, { recursive: true });
    try { fs.cpSync(src, activeDest, { recursive: true, force: true }); } catch (e: any) { if (e.code !== "EEXIST") throw e; }
    deployed++;
  }
  logger.info({ selected: selectedSkillNames.length, deployed }, 'Dynamic skills deployed');
}

/**
 * Install a skill from a GitHub repository URL.
 * Supports:
 *   - https://github.com/user/repo                    (whole repo = skill)
 *   - https://github.com/user/repo/tree/branch/path   (subdirectory = skill)
 * Clones into a temp dir, copies SKILL.md + references/ to ~/.claude/skills/<name>/.
 * Returns the installed skill name.
 */
export function installFromGithub(
  githubUrl: string,
  skillName: string | undefined,
  logger: Logger,
): { name: string; path: string; alreadyInstalled: boolean } {
  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) throw new Error(`Invalid GitHub URL: ${githubUrl}`);

  const resolvedName = skillName || parsed.subdir?.split('/').pop() || parsed.repo;

  const userSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  const destDir = path.join(userSkillsDir, resolvedName);

  if (fs.existsSync(path.join(destDir, 'SKILL.md'))) {
    logger.info({ skill: resolvedName }, 'Skill already installed, skipping clone');
    return { name: resolvedName, path: destDir, alreadyInstalled: true };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panmira-skill-'));
  try {
    const cloneUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    const cloneArgs = ['clone', '--depth', '1'];
    if (parsed.branch) cloneArgs.push('--branch', parsed.branch);
    cloneArgs.push(cloneUrl, tmpDir);

    execFileSync('git', cloneArgs, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
    logger.info({ cloneUrl, branch: parsed.branch }, 'Skill repo cloned');

    const srcDir = parsed.subdir ? path.join(tmpDir, parsed.subdir) : tmpDir;

    if (!fs.existsSync(path.join(srcDir, 'SKILL.md'))) {
      throw new Error(`No SKILL.md found in ${parsed.subdir ? parsed.subdir : 'repo root'}`);
    }

    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(path.join(srcDir, 'SKILL.md'), path.join(destDir, 'SKILL.md'));

    const refsDir = path.join(srcDir, 'references');
    if (fs.existsSync(refsDir)) {
      fs.cpSync(refsDir, path.join(destDir, 'references'), { recursive: true });
    }

    for (const file of fs.readdirSync(srcDir)) {
      if (file.endsWith('.md') && file !== 'SKILL.md') {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
      }
    }

    logger.info({ skill: resolvedName, dest: destDir }, 'Skill installed from GitHub');
    return { name: resolvedName, path: destDir, alreadyInstalled: false };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Sync a skill from ~/.claude/skills/ to all bots' staging directories.
 * Called after installing a new skill (GitHub/Hub) so existing bots can use it.
 */
export function syncSkillToBotStaging(skillName: string, botWorkDirs: string[], logger: Logger): void {
  const userSrc = path.join(os.homedir(), '.claude', 'skills', skillName);
  if (!fs.existsSync(userSrc)) return;

  let synced = 0;
  for (const workDir of botWorkDirs) {
    const stagingDest = path.join(workDir, '.claude', 'skills-staging', skillName);
    try {
      fs.mkdirSync(stagingDest, { recursive: true });
      fs.cpSync(userSrc, stagingDest, { recursive: true });
      synced++;
    } catch (err: any) {
      logger.warn({ err: err.message, skillName, workDir }, 'Failed to sync skill to bot staging');
    }
  }
  logger.info({ skillName, synced, totalBots: botWorkDirs.length }, 'Skill synced to bot staging dirs');
}

interface ParsedGithubUrl {
  owner: string;
  repo: string;
  branch?: string;
  subdir?: string;
}

function parseGithubUrl(url: string): ParsedGithubUrl | null {
  let match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (match) return { owner: match[1], repo: match[2] };

  match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)\/tree\/([^/]+)\/(.+?)\/?$/);
  if (match) return { owner: match[1], repo: match[2], branch: match[3], subdir: match[4] };

  return null;
}

/** Locate the lark-cli executable. */
function findLarkCli(): string | null {
  const candidates = [path.join(os.homedir(), '.npm-global', 'bin', 'lark-cli'), '/usr/local/bin/lark-cli'];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Try PATH via which
  try {
    const result = execFileSync('which', ['lark-cli'], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 5_000 });
    const p = result.toString().trim();
    if (p) return p;
  } catch {
    /* not in PATH */
  }
  return null;
}
