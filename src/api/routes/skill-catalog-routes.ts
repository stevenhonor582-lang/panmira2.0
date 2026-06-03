import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type * as http from 'node:http';
import { jsonResponse, parseJsonBody } from './helpers.js';
import type { RouteContext } from './types.js';
import { SKILL_REGISTRY } from '../../skills/skill-registry.js';

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  skillCount: number;
  agentCount: number;
  commandCount: number;
  enabled: boolean;
}

interface CatalogSkill {
  name: string;
  description: string;
  origin: string;
  pluginId: string;
  pluginName: string;
  directory: string;
}

interface StoredData {
  plugins: PluginInfo[];
  skills: CatalogSkill[];
  skillContents: Record<string, string>;
  updatedAt: string;
}

const DATA_FILE = path.join(process.env.HOME || '/home/ubuntu', '.panmira', 'skills-data.json');

function loadData(): StoredData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch {
    /* ignore */
  }
  return { plugins: [], skills: [], skillContents: {}, updatedAt: '' };
}

function saveData(data: StoredData): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

let memCache: StoredData | null = null;
function getData(): StoredData {
  if (!memCache) memCache = loadData();
  return memCache;
}

export async function handleSkillCatalogRoutes(
  _ctx: RouteContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (!url.startsWith('/api/skills/')) return false;

  // GET /api/skills/plugins
  if (method === 'GET' && url === '/api/skills/plugins') {
    const data = getData();
    const enriched = data.plugins.map((p) => {
      const skillCount = data.skills.filter(
        (s) =>
          s.pluginName ===
          (p.name === 'superpowers' ? 'Superpowers' : p.name.includes('claude-mem') ? 'Claude-Mem' : 'ECC'),
      ).length;
      return { ...p, skillCount, agentCount: 0, commandCount: 0 };
    });
    jsonResponse(res, 200, { plugins: enriched });
    return true;
  }

  // GET /api/skills/catalog
  if (method === 'GET' && url === '/api/skills/catalog') {
    const stored = getData().skills;
    // Add dynamically discovered skills from SKILL_REGISTRY that aren't in the static catalog
    const storedNames = new Set(stored.map((s) => s.name));
    const dynamicSkills: CatalogSkill[] = SKILL_REGISTRY.filter((s) => !storedNames.has(s.name)).map((s) => ({
      name: s.name,
      description: s.summary,
      origin: 'filesystem',
      pluginId: '',
      pluginName: 'User Skills',
      directory: path.join(os.homedir(), '.claude', 'skills', s.name),
    }));
    jsonResponse(res, 200, { skills: [...stored, ...dynamicSkills] });
    return true;
  }

  // GET /api/skills/catalog-content?dir=xxx
  if (method === 'GET' && url.startsWith('/api/skills/catalog-content')) {
    const params = new URL(url, 'http://localhost').searchParams;
    const dir = params.get('dir');
    if (!dir || dir.includes('..')) {
      jsonResponse(res, 400, { error: 'Missing or invalid dir parameter' });
      return true;
    }
    // Try static catalog first
    const data = getData();
    const content = data.skillContents[dir];
    if (content) {
      jsonResponse(res, 200, { name: dir, skillMd: content, references: [] });
      return true;
    }
    // Fallback: read SKILL.md from filesystem
    const skillMdPath = path.join(dir, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      const md = fs.readFileSync(skillMdPath, 'utf-8');
      jsonResponse(res, 200, { name: path.basename(dir), skillMd: md, references: [] });
      return true;
    }
    jsonResponse(res, 404, { error: 'Skill not found' });
    return true;
  }

  // POST /api/skills/seed — upload plugin + skill data
  if (method === 'POST' && url === '/api/skills/seed') {
    const body = (await parseJsonBody(req)) as {
      plugins?: any[];
      skills?: any[];
      skillContents?: Record<string, string>;
    };
    const data = getData();
    if (body.plugins)
      data.plugins = body.plugins.map((p: any) => ({
        id: p.id || '',
        name: p.name || '',
        version: p.version || '',
        description: p.description || '',
        author: p.author || '',
        skillCount: 0,
        agentCount: 0,
        commandCount: 0,
        enabled: p.enabled !== false,
      }));
    if (body.skills)
      data.skills = body.skills.map((s: any) => ({
        name: s.name || '',
        description: s.description || '',
        origin: s.origin || '',
        pluginId: s.pluginId || '',
        pluginName: s.pluginName || '',
        directory: s.directory || '',
      }));
    if (body.skillContents) data.skillContents = body.skillContents;
    saveData(data);
    memCache = data;
    jsonResponse(res, 200, {
      count: data.skills.length,
      plugins: data.plugins.length,
      updatedAt: data.updatedAt,
    });
    return true;
  }

  return false;
}
