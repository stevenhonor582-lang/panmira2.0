import * as crypto from 'node:crypto';
import { pool } from '../db/index.js';
import type { Logger } from '../utils/logger.js';

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  version: number;
  author: string;
  tags: string[];
  userInvocable: boolean;
  context?: string;
  allowedTools?: string;
  skillMd: string;
  hasReferences: boolean;
  publishedAt: string;
  updatedAt: string;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  version: number;
  author: string;
  tags: string[];
  publishedAt: string;
  updatedAt: string;
}

export interface SkillSearchResult extends SkillSummary {
  snippet: string;
}

export interface SkillPublishInput {
  name: string;
  skillMd: string;
  referencesTar?: Buffer;
  author?: string;
}

function parseFrontmatter(content: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return meta;
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      meta[key] = value;
    }
  }
  return meta;
}

export class SkillHubStore {
  private logger: Logger;

  constructor(databaseDir: string, logger: Logger) {
    this.logger = logger.child({ module: 'skill-hub' });
    this.logger.info('Skill Hub store initialized');
  }

  async publish(input: SkillPublishInput): Promise<SkillRecord> {
    const meta = parseFrontmatter(input.skillMd);
    const name = input.name || meta['name'] || 'unnamed-skill';
    const description = meta['description'] || '';
    const tags = meta['tags'] ? meta['tags'].split(',').map((t) => t.trim()) : [];
    const userInvocable = meta['user-invocable'] !== 'false';
    const context = meta['context'] || undefined;
    const allowedTools = meta['allowed-tools'] || undefined;
    const now = new Date().toISOString();

    const existing = (await pool.query('SELECT id, version FROM skills WHERE name = $1', [name])).rows[0] as
      | { id: string; version: number }
      | undefined;

    if (existing) {
      await pool.query(
        `UPDATE skills SET
          description = $1, version = $2, author = $3, tags = $4,
          user_invocable = $5, context = $6, allowed_tools = $7,
          skill_md = $8, references_tar = $9, updated_at = $10
        WHERE name = $11`,
        [
          description,
          existing.version + 1,
          input.author || '',
          JSON.stringify(tags),
          userInvocable ? 1 : 0,
          context || null,
          allowedTools || null,
          input.skillMd,
          input.referencesTar || null,
          now,
          name,
        ],
      );

      this.logger.info({ name, version: existing.version + 1 }, 'Skill updated');
      return (await this.get(name))!;
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO skills (id, name, description, version, author, tags,
        user_invocable, context, allowed_tools, skill_md, references_tar,
        published_at, updated_at)
      VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        name,
        description,
        input.author || '',
        JSON.stringify(tags),
        userInvocable ? 1 : 0,
        context || null,
        allowedTools || null,
        input.skillMd,
        input.referencesTar || null,
        now,
        now,
      ],
    );

    this.logger.info({ name, id }, 'Skill published');
    return (await this.get(name))!;
  }

  async get(name: string): Promise<SkillRecord | undefined> {
    const row = (await pool.query('SELECT * FROM skills WHERE name = $1', [name])).rows[0];
    if (!row) return undefined;
    return this.rowToRecord(row);
  }

  async getContent(name: string): Promise<{ skillMd: string; referencesTar?: Buffer } | undefined> {
    const row = (await pool.query('SELECT skill_md, references_tar FROM skills WHERE name = $1', [name])).rows[0];
    if (!row) return undefined;
    return {
      skillMd: row.skill_md,
      referencesTar: row.references_tar || undefined,
    };
  }

  async list(): Promise<SkillSummary[]> {
    const rows = (
      await pool.query(
        'SELECT id, name, description, version, author, tags, published_at, updated_at FROM skills ORDER BY updated_at DESC',
      )
    ).rows;
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      author: row.author,
      tags: JSON.parse(row.tags || '[]'),
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    }));
  }

  async search(query: string): Promise<SkillSearchResult[]> {
    const escaped = this.escapeFts5Query(query);
    if (!escaped) {
      return (await this.list()).map((s) => ({ ...s, snippet: '' }));
    }

    const rows = (
      await pool.query(
        `SELECT s.id, s.name, s.description, s.version, s.author, s.tags,
              s.published_at, s.updated_at,
              ts_headline('simple', s.skill_md, plainto_ts_query('simple', $1), '<b>', '</b>') as snippet
       FROM skills s
       WHERE to_tsvector('simple', coalesce(s.name,'') || ' ' || coalesce(s.description,'') || ' ' || coalesce(s.tags,'') || ' ' || coalesce(s.skill_md,'')) @@ plainto_ts_query('simple', $1)
       ORDER BY ts_rank(to_tsvector('simple', coalesce(s.name,'') || ' ' || coalesce(s.description,'') || ' ' || coalesce(s.tags,'') || ' ' || coalesce(s.skill_md,'')), plainto_ts_query('simple', $1)) DESC
       LIMIT $2`,
        [escaped, 50],
      )
    ).rows;

    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      author: row.author,
      tags: JSON.parse(row.tags || '[]'),
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      snippet: row.snippet || '',
    }));
  }

  async remove(name: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM skills WHERE name = $1', [name]);
    if ((result.rowCount ?? 0) > 0) {
      this.logger.info({ name }, 'Skill removed');
      return true;
    }
    return false;
  }

  private rowToRecord(row: any): SkillRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      author: row.author,
      tags: JSON.parse(row.tags || '[]'),
      userInvocable: row.user_invocable === 1,
      context: row.context || undefined,
      allowedTools: row.allowed_tools || undefined,
      skillMd: row.skill_md,
      hasReferences: !!row.references_tar,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    };
  }

  private escapeFts5Query(query: string): string {
    return query
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => `"${token.replace(/"/g, '')}"`)
      .join(' ');
  }
}
