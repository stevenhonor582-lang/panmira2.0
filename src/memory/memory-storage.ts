import crypto from 'crypto';
import { pool } from '../db/index.js';
import type { Logger } from '../utils/logger.js';
import type { DocEmbedder } from './doc-embedder.js';
import { chunkDocument } from './document-chunker.js';
import type { AutoTagger } from './auto-tagger.js';

export type Role = 'admin' | 'reader';
export type Visibility = 'shared' | 'private';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

export interface FolderTreeNode {
  id: string;
  name: string;
  path: string;
  visibility: Visibility;
  children: FolderTreeNode[];
  document_count: number;
}

export interface Document {
  id: string;
  title: string;
  folder_id: string;
  path: string;
  content: string;
  tags: string[];
  summary: string;
  quality_score: number;
  feedback_count: number;
  file_url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  folder_id: string;
  path: string;
  tags: string[];
  summary: string;
  quality_score: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: string;
  title: string;
  path: string;
  snippet: string;
  tags: string[];
  summary: string;
  quality_score: number;
  created_by: string;
  updated_at: string;
  score?: number;
  source?: 'vector' | 'keyword' | 'hybrid';
}

export interface DocumentCreateInput {
  title: string;
  folder_id?: string;
  content?: string;
  tags?: string[];
  created_by?: string;
}

export interface DocumentUpdateInput {
  title?: string;
  content?: string;
  tags?: string[];
  folder_id?: string;
  skipAutoTag?: boolean;
}

export interface StaleDocument {
  id: string;
  title: string;
  path: string;
  tags: string[];
  age_days: number;
  content_length: number;
  reason: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/ /g, '-');
}

export function escapeFts5Query(query: string): string {
  const tokens = query.trim().split(/\s+/);
  const escaped: string[] = [];
  for (const token of tokens) {
    const clean = token.replace(/"/g, '');
    if (clean) {
      escaped.push(`"${clean}"`);
    }
  }
  return escaped.length > 0 ? escaped.join(' ') : '""';
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
  }
  return [];
}

function contentHash(title: string, content: string): string {
  const normalized = `${title}\n${content.slice(0, 2000)}`.replace(/\s+/g, ' ').trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export class MemoryStorage {
  private logger: Logger;
  private embedder: DocEmbedder | null;
  private autoTagger: AutoTagger | null;

  constructor(_databaseDir: string, logger: Logger, embedder?: DocEmbedder, autoTagger?: AutoTagger) {
    this.logger = logger;
    this.embedder = embedder || null;
    this.autoTagger = autoTagger || null;
    this.logger.info('MetaMemory storage initialized');
  }

  private async computeFolderPath(parentId: string, name: string): Promise<string> {
    const result = await pool.query('SELECT path FROM folders WHERE id = $1', [parentId]);
    if (result.rows.length === 0) throw new Error(`Parent folder not found: ${parentId}`);
    const parentPath = result.rows[0].path.replace(/\/+$/, '');
    return `${parentPath}/${name}`;
  }

  async createFolder(name: string, parentId = 'root', visibility: Visibility = 'shared'): Promise<Folder> {
    const folderPath = await this.computeFolderPath(parentId, name);

    const existing = (await pool.query('SELECT * FROM folders WHERE path = $1', [folderPath])).rows[0] as
      | Folder
      | undefined;
    if (existing) return existing;

    const now = nowISO();
    const id = generateId();
    await pool.query(
      'INSERT INTO folders (id, name, parent_id, path, visibility, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, name, parentId, folderPath, visibility, now, now],
    );

    return { id, name, parent_id: parentId, path: folderPath, visibility, created_at: now, updated_at: now };
  }

  async getFolderTree(role: Role = 'admin'): Promise<FolderTreeNode> {
    const folders = (await pool.query('SELECT * FROM folders')).rows as Folder[];
    const docCounts = (await pool.query('SELECT folder_id, COUNT(*) as count FROM documents GROUP BY folder_id'))
      .rows as { folder_id: string; count: number }[];

    const countMap = new Map<string, number>();
    for (const row of docCounts) {
      countMap.set(row.folder_id, Number(row.count));
    }

    const visibleFolders = role === 'admin' ? folders : folders.filter((f) => f.visibility !== 'private');

    const nodeMap = new Map<string, FolderTreeNode>();
    for (const f of visibleFolders) {
      nodeMap.set(f.id, {
        id: f.id,
        name: f.name,
        path: f.path,
        visibility: f.visibility || 'shared',
        children: [],
        document_count: countMap.get(f.id) || 0,
      });
    }

    let root: FolderTreeNode | undefined;
    for (const f of visibleFolders) {
      const node = nodeMap.get(f.id)!;
      if (f.parent_id && nodeMap.has(f.parent_id)) {
        nodeMap.get(f.parent_id)!.children.push(node);
      } else if (!f.parent_id || f.id === 'root') {
        root = node;
      }
    }

    return root || { id: 'root', name: 'Root', path: '/', visibility: 'shared', children: [], document_count: 0 };
  }

  async deleteFolder(folderId: string): Promise<void> {
    if (folderId === 'root') throw new Error('Cannot delete root folder');
    const folder = (await pool.query('SELECT id FROM folders WHERE id = $1', [folderId])).rows[0];
    if (!folder) throw new Error(`Folder not found: ${folderId}`);

    await pool.query('DELETE FROM documents WHERE folder_id = $1', [folderId]);
    const children = (await pool.query('SELECT id FROM folders WHERE parent_id = $1', [folderId])).rows as {
      id: string;
    }[];
    for (const child of children) {
      await this.deleteFolder(child.id);
    }
    await pool.query('DELETE FROM folders WHERE id = $1', [folderId]);
  }

  async isFolderAccessible(folderId: string, role: Role): Promise<boolean> {
    if (role === 'admin') return true;
    const result = await pool.query('SELECT visibility FROM folders WHERE id = $1', [folderId]);
    if (result.rows.length === 0) return false;
    return result.rows[0].visibility !== 'private';
  }

  async getAccessibleFolderIds(role: Role): Promise<Set<string>> {
    if (role === 'admin') {
      const rows = (await pool.query('SELECT id FROM folders')).rows as { id: string }[];
      return new Set(rows.map((r) => r.id));
    }
    const rows = (await pool.query("SELECT id FROM folders WHERE visibility != 'private'")).rows as { id: string }[];
    return new Set(rows.map((r) => r.id));
  }

  async updateFolder(folderId: string, data: { visibility?: Visibility }): Promise<Folder | null> {
    const existing = (await pool.query('SELECT * FROM folders WHERE id = $1', [folderId])).rows[0] as
      | Folder
      | undefined;
    if (!existing) return null;
    const visibility = data.visibility ?? existing.visibility;
    const now = nowISO();
    await pool.query('UPDATE folders SET visibility = $1, updated_at = $2 WHERE id = $3', [visibility, now, folderId]);
    return { ...existing, visibility, updated_at: now };
  }

  async renameFolder(folderId: string, newName: string): Promise<Folder | null> {
    const existing = (await pool.query('SELECT * FROM folders WHERE id = $1', [folderId])).rows[0] as
      | Folder
      | undefined;
    if (!existing) return null;
    const parentResult = await pool.query('SELECT path FROM folders WHERE id = $1', [existing.parent_id]);
    if (parentResult.rows.length === 0) return null;
    const parentPath = (parentResult.rows[0].path as string).replace(/\/+$/, '');
    const newPath = `${parentPath}/${newName}`;
    const now = nowISO();
    await pool.query('UPDATE folders SET name = $1, path = $2, updated_at = $3 WHERE id = $4', [
      newName,
      newPath,
      now,
      folderId,
    ]);
    const oldPath = existing.path.replace(/\/+$/, '');
    await pool.query('UPDATE folders SET path = REPLACE(path, $1, $2) WHERE path LIKE $3', [
      oldPath,
      newPath,
      `${oldPath}/%`,
    ]);
    await pool.query('UPDATE documents SET path = REPLACE(path, $1, $2) WHERE path LIKE $3', [
      oldPath,
      newPath,
      `${oldPath}/%`,
    ]);
    return { ...existing, name: newName, path: newPath, updated_at: now };
  }

  private async computeDocPath(folderId: string, title: string): Promise<string> {
    const result = await pool.query('SELECT path FROM folders WHERE id = $1', [folderId]);
    if (result.rows.length === 0) throw new Error(`Folder not found: ${folderId}`);
    const folderPath = result.rows[0].path.replace(/\/+$/, '');
    const basePath = `${folderPath}/${slugify(title)}`;
    const conflictCheck = await pool.query(
      'SELECT path FROM documents WHERE path = $1 OR path LIKE $2',
      [basePath, `${basePath}-%`],
    );
    if (conflictCheck.rows.length === 0) return basePath;
    const taken = new Set(conflictCheck.rows.map((r: any) => r.path as string));
    if (!taken.has(basePath)) return basePath;
    let suffix = 2;
    while (taken.has(`${basePath}-${suffix}`)) suffix++;
    return `${basePath}-${suffix}`;
  }

  async createDocument(data: DocumentCreateInput, role: Role = 'admin'): Promise<Document> {
    const folderId = data.folder_id || 'root';
    if (!(await this.isFolderAccessible(folderId, role))) {
      throw new Error('Access denied: cannot create document in private folder');
    }
    const docPath = await this.computeDocPath(folderId, data.title);
    const now = nowISO();
    const id = generateId();
    const content = data.content || '';

    // Dedup check
    const hash = contentHash(data.title, content);
    if (content) {
      const dupCheck = await pool.query(
        'SELECT id, title, path FROM documents WHERE content_hash = $1 LIMIT 1',
        [hash],
      );
      if (dupCheck.rows.length > 0) {
        const dup = dupCheck.rows[0];
        throw new Error(`内容重复: 已存在相同内容的文档 "${dup.title}" (路径: ${dup.path})`);
      }
    }

    // Auto-tag
    let tags = data.tags || [];
    if (tags.length === 0 && this.autoTagger && content) {
      tags = await this.autoTagger.extractTags(data.title, content);
    }

    // Auto-summarize
    let summary = '';
    if (this.autoTagger && content) {
      summary = await this.autoTagger.summarize(data.title, content);
    }

    await pool.query(
      'INSERT INTO documents (id, title, folder_id, path, content, tags, summary, content_hash, quality_score, feedback_count, file_url, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
      [id, data.title, folderId, docPath, content, JSON.stringify(tags), summary, hash, 0, 0, '', data.created_by || '', now, now],
    );

    if (this.embedder && content) {
      this.embedAndStore(id, `${data.title}\n${content}`).catch((err) => {
        this.logger.warn({ err: err.message, docId: id }, 'Failed to generate embedding');
      });
      this.chunkAndEmbed(id, data.title, content).catch((err) => {
        this.logger.warn({ err: err.message, docId: id }, 'Failed to chunk document');
      });
    }

    return {
      id,
      title: data.title,
      folder_id: folderId,
      path: docPath,
      content,
      tags,
      summary,
      quality_score: 0,
      feedback_count: 0,
      file_url: '',
      created_by: data.created_by || '',
      created_at: now,
      updated_at: now,
    };
  }

  async getDocument(docId: string, role: Role = 'admin'): Promise<Document | null> {
    const row = (
      await pool.query(
        'SELECT id, title, folder_id, path, content, tags, summary, quality_score, feedback_count, created_by, created_at, updated_at FROM documents WHERE id = $1',
        [docId],
      )
    ).rows[0] as (Omit<Document, 'tags'> & { tags: string }) | undefined;
    if (!row) return null;
    if (!(await this.isFolderAccessible(row.folder_id, role))) return null;
    return { ...row, tags: parseTags(row.tags), summary: row.summary || '', quality_score: Number(row.quality_score) || 0, feedback_count: Number(row.feedback_count) || 0 };
  }

  async getDocumentByPath(docPath: string, role: Role = 'admin'): Promise<Document | null> {
    const row = (
      await pool.query(
        'SELECT id, title, folder_id, path, content, tags, summary, quality_score, feedback_count, created_by, created_at, updated_at FROM documents WHERE path = $1',
        [docPath],
      )
    ).rows[0] as (Omit<Document, 'tags'> & { tags: string }) | undefined;
    if (!row) return null;
    if (!(await this.isFolderAccessible(row.folder_id, role))) return null;
    return { ...row, tags: parseTags(row.tags), summary: row.summary || '', quality_score: Number(row.quality_score) || 0, feedback_count: Number(row.feedback_count) || 0 };
  }

  async listDocuments(folderId?: string, limit = 50, offset = 0, role: Role = 'admin'): Promise<DocumentSummary[]> {
    let rows: any[];
    if (folderId) {
      if (!(await this.isFolderAccessible(folderId, role))) return [];
      rows = (
        await pool.query(
          'SELECT id, title, folder_id, path, tags, summary, quality_score, created_by, created_at, updated_at FROM documents WHERE folder_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
          [folderId, limit, offset],
        )
      ).rows;
    } else if (role === 'admin') {
      rows = (
        await pool.query(
          'SELECT id, title, folder_id, path, tags, summary, quality_score, created_by, created_at, updated_at FROM documents ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
          [limit, offset],
        )
      ).rows;
    } else {
      rows = (
        await pool.query(
          `SELECT d.id, d.title, d.folder_id, d.path, d.tags, d.summary, d.quality_score, d.created_by, d.created_at, d.updated_at
         FROM documents d JOIN folders f ON d.folder_id = f.id
         WHERE f.visibility != 'private'
         ORDER BY CASE WHEN d.title ILIKE $1 THEN 0 ELSE 1 END, d.updated_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        )
      ).rows;
    }
    return rows.map((r) => ({ ...r, tags: parseTags(r.tags), summary: r.summary || '', quality_score: Number(r.quality_score) || 0 }));
  }

  async findBacklinks(docTitle: string): Promise<DocumentSummary[]> {
    const pattern = `%[[${docTitle}]]%`;
    const { rows } = await pool.query(
      `SELECT id, title, folder_id, path, tags, summary, quality_score, created_by, created_at, updated_at
       FROM documents WHERE content ILIKE $1
       ORDER BY updated_at DESC LIMIT 20`,
      [pattern],
    );
    return rows.map((r: any) => ({ ...r, tags: parseTags(r.tags), summary: r.summary || '', quality_score: Number(r.quality_score) || 0 }));
  }

  async updateDocument(docId: string, data: DocumentUpdateInput, role: Role = 'admin'): Promise<Document | null> {
    const existing = (await pool.query('SELECT * FROM documents WHERE id = $1', [docId])).rows[0] as
      | (Omit<Document, 'tags'> & { tags: string; summary: string })
      | undefined;
    if (!existing) return null;
    if (!(await this.isFolderAccessible(existing.folder_id, role))) return null;

    const title = data.title ?? existing.title;
    const content = data.content ?? existing.content;

    let tags = data.tags ?? parseTags(existing.tags);
    if (!data.skipAutoTag && data.tags === undefined && data.content !== undefined && this.autoTagger && content) {
      const autoTags = await this.autoTagger.extractTags(title, content);
      if (autoTags.length > 0) tags = autoTags;
    }

    let summary = existing.summary || '';
    if (!data.skipAutoTag && (data.content !== undefined || data.title !== undefined) && this.autoTagger && content) {
      summary = await this.autoTagger.summarize(title, content);
    }

    const folderId = data.folder_id ?? existing.folder_id;

    let docPath = existing.path;
    if (data.title !== undefined || data.folder_id !== undefined) {
      docPath = await this.computeDocPath(folderId, title);
    }

    let hash = (existing as any).content_hash || '';
    if (data.content !== undefined || data.title !== undefined) {
      hash = contentHash(title, content);
    }

    const now = nowISO();
    await pool.query(
      'UPDATE documents SET title = $1, content = $2, tags = $3, folder_id = $4, path = $5, summary = $6, content_hash = $7, updated_at = $8 WHERE id = $9',
      [title, content, JSON.stringify(tags), folderId, docPath, summary, hash, now, docId],
    );

    const contentChanged = data.content !== undefined || data.title !== undefined;
    if (this.embedder && contentChanged) {
      this.embedAndStore(docId, `${title}\n${content}`).catch((err) => {
        this.logger.warn({ err: err.message, docId }, 'Failed to regenerate embedding');
      });
      this.rechunkDocument(docId, title, content).catch((err) => {
        this.logger.warn({ err: err.message, docId }, 'Failed to re-chunk document');
      });
    }

    return {
      id: docId,
      title,
      folder_id: folderId,
      path: docPath,
      content,
      tags,
      summary,
      quality_score: Number(existing.quality_score) || 0,
      feedback_count: Number(existing.feedback_count) || 0,
      file_url: (existing as any).file_url || '',
      created_by: existing.created_by,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  async deleteDocument(docId: string, role: Role = 'admin'): Promise<boolean> {
    if (role !== 'admin') {
      const doc = (await pool.query('SELECT folder_id FROM documents WHERE id = $1', [docId])).rows[0] as
        | { folder_id: string }
        | undefined;
      if (!doc || !(await this.isFolderAccessible(doc.folder_id, role))) return false;
    }
    const result = await pool.query('DELETE FROM documents WHERE id = $1', [docId]);
    return (result.rowCount ?? 0) > 0;
  }

  // ── Quality Feedback ──

  async submitFeedback(docId: string, score: number): Promise<{ quality_score: number; feedback_count: number } | null> {
    if (score < 1 || score > 5) throw new Error('Score must be between 1 and 5');

    const existing = await pool.query(
      'SELECT quality_score, feedback_count FROM documents WHERE id = $1',
      [docId],
    );
    if (existing.rows.length === 0) return null;

    const oldScore = Number(existing.rows[0].quality_score) || 0;
    const oldCount = Number(existing.rows[0].feedback_count) || 0;
    const newCount = oldCount + 1;
    const newScore = Math.round(((oldScore * oldCount + score) / newCount) * 100) / 100;

    await pool.query(
      'UPDATE documents SET quality_score = $1, feedback_count = $2 WHERE id = $3',
      [newScore, newCount, docId],
    );

    return { quality_score: newScore, feedback_count: newCount };
  }

  // ── Smart Cleanup ──

  async findStaleDocuments(olderThanDays = 30, minContentLength = 50): Promise<StaleDocument[]> {
    const { rows } = await pool.query(
      `SELECT id, title, path, tags, content, updated_at
       FROM documents
       WHERE updated_at::timestamp < NOW() - INTERVAL '1 day' * $1
         AND length(content) < $2
         AND NOT (tags::text ILIKE '%_index%')
       ORDER BY updated_at ASC
       LIMIT 50`,
      [olderThanDays, minContentLength],
    );

    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      path: r.path,
      tags: parseTags(r.tags),
      age_days: Math.floor((Date.now() - new Date(r.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
      content_length: String(r.content || '').length,
      reason: this.classifyStaleReason(r.title, r.content, parseTags(r.tags)),
    }));
  }

  private classifyStaleReason(title: string, content: string, tags: string[]): string {
    if (tags.length === 0) return '无标签';
    if ((content || '').length < 20) return '内容过短';
    if (/^(test|tmp|temp|临时|测试)/i.test(title)) return '疑似临时文件';
    return '长期未更新';
  }

  // ── Knowledge Graph / Related Documents ──

  async findRelatedDocuments(docId: string, limit = 10): Promise<SearchResult[]> {
    const doc = await this.getDocument(docId);
    if (!doc) return [];

    const docTags = doc.tags || [];
    const results: SearchResult[] = [];

    // 1. Tag overlap search
    if (docTags.length > 0) {
      const tagConditions = docTags.map((_, i) => `d.tags::text ILIKE $${i + 2}`).join(' OR ');
      const tagParams: any[] = [docId];
      for (const tag of docTags) tagParams.push(`%${tag}%`);

      const { rows } = await pool.query(
        `SELECT d.id, d.title, d.path, d.tags, d.summary, d.quality_score, d.created_by, d.updated_at,
                substring(d.content from 1 for 200) as snippet
         FROM documents d
         WHERE d.id != $1 AND (${tagConditions})
         ORDER BY d.quality_score DESC, d.updated_at DESC
         LIMIT ${limit}`,
        tagParams,
      );

      for (const r of rows) {
        const rTags = parseTags(r.tags);
        const overlap = docTags.filter((t) => rTags.includes(t)).length;
        results.push(this.rowToSearchResult(r, overlap / Math.max(docTags.length, 1), 'keyword'));
      }
    }

    // 2. Vector similarity fallback
    if (this.embedder && results.length < limit) {
      try {
        const embedding = await this.embedder.embed(`${doc.title}\n${doc.content.slice(0, 500)}`);
        if (embedding && !embedding.every((v) => v === 0)) {
          const vecStr = JSON.stringify(embedding);
          const excludeIds = [docId, ...results.map((r) => r.id)];
          const placeholders = excludeIds.map((_, i) => `$${i + 2}`).join(',');
          const { rows: vecRows } = await pool.query(
            `SELECT d.id, d.title, d.path, d.tags, d.summary, d.quality_score, d.created_by, d.updated_at,
                    left(d.content, 200) as snippet,
                    1 - ($1::vector <=> d.embedding) as similarity
             FROM documents d
             WHERE d.embedding IS NOT NULL AND d.id NOT IN (${placeholders})
             ORDER BY d.embedding <=> $1::vector
             LIMIT ${limit - results.length}`,
            [vecStr, ...excludeIds],
          );
          for (const r of vecRows) {
            results.push(this.rowToSearchResult(r, Number(r.similarity) || 0, 'vector'));
          }
        }
      } catch {
        // vector search is best-effort
      }
    }

    return results.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
  }

    private async embedAndStore(docId: string, text: string): Promise<void> {
    const embedding = await this.embedder!.embed(text);
    if (embedding.every((v) => v === 0)) return;
    await pool.query('UPDATE documents SET embedding = $1 WHERE id = $2', [JSON.stringify(embedding), docId]);
  }

  private async chunkAndEmbed(docId: string, title: string, content: string): Promise<void> {
    const chunks = chunkDocument(title, content);
    if (chunks.length === 0) return;

    const now = nowISO();
    for (const chunk of chunks) {
      const chunkId = generateId();
      await pool.query(
        'INSERT INTO document_chunks (id, document_id, chunk_index, content, heading, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [chunkId, docId, chunk.index, chunk.content, chunk.heading || null, now],
      );

      this.embedChunk(chunkId, chunk.content).catch((err) => {
        this.logger.warn({ err: err.message, chunkId }, 'Failed to embed chunk');
      });
    }
  }

  private async rechunkDocument(docId: string, title: string, content: string): Promise<void> {
    await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [docId]);
    await this.chunkAndEmbed(docId, title, content);
  }

  private async embedChunk(chunkId: string, text: string): Promise<void> {
    const embedding = await this.embedder!.embed(text);
    if (embedding.every((v) => v === 0)) return;
    await pool.query('UPDATE document_chunks SET embedding = $1 WHERE id = $2', [JSON.stringify(embedding), chunkId]);
  }

  private static readonly RRF_K = 60;
  private static readonly SIMILARITY_THRESHOLD = 0.6;

  private async expandFolderIds(folderIds: string[]): Promise<string[]> {
    if (folderIds.length === 0) return [];
    const allIds = new Set(folderIds);
    let current = [...folderIds];
    while (current.length > 0) {
      const { rows } = await pool.query(
        'SELECT id FROM folders WHERE parent_id = ANY($1)',
        [current]
      );
      current = rows.map((r: any) => r.id).filter((id: string) => !allIds.has(id));
      for (const id of current) allIds.add(id);
    }
    return [...allIds];
  }

  async searchDocuments(
    query: string,
    limit = 20,
    role: Role = 'admin',
    folderIds?: string[],
  ): Promise<SearchResult[]> {
    if (!this.embedder) {
      return this.keywordSearch(query, limit, role, folderIds);
    }

    const expandedLimit = Math.min(limit * 2, 40);
    const [vecSettled, kwSettled] = await Promise.allSettled([
      this.vectorSearch(query, expandedLimit, role, folderIds),
      this.keywordSearch(query, expandedLimit, role, folderIds),
    ]);

    const vecResults = vecSettled.status === 'fulfilled' ? vecSettled.value : [];
    const kwResults = kwSettled.status === 'fulfilled' ? kwSettled.value : [];

    if (vecResults.length === 0 && kwResults.length === 0) return [];

    if (vecResults.length === 0) {
      return kwResults.slice(0, limit);
    }
    if (kwResults.length === 0) {
      return vecResults.slice(0, limit);
    }

    const scoreMap = new Map<string, { result: SearchResult; score: number }>();
    for (let i = 0; i < kwResults.length; i++) {
      scoreMap.set(kwResults[i].id, { result: kwResults[i], score: 1 / (MemoryStorage.RRF_K + i + 1) });
    }
    for (let i = 0; i < vecResults.length; i++) {
      const r = vecResults[i];
      const existing = scoreMap.get(r.id);
      if (existing) {
        existing.score += 1 / (MemoryStorage.RRF_K + i + 1);
        existing.result.source = 'hybrid';
      } else {
        scoreMap.set(r.id, { result: r, score: 1 / (MemoryStorage.RRF_K + i + 1) });
      }
    }

    return [...scoreMap.values()]
      .map((item) => {
        const quality = Number(item.result.quality_score) || 0;
        item.score = item.score * (1 + quality * 0.2);
        return item;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => ({
        ...item.result,
        score: Math.round(item.score * 10000) / 10000,
      }));
  }

  private async vectorSearch(query: string, limit: number, role: Role, folderIds?: string[]): Promise<SearchResult[]> {
    const expandedIds = folderIds && folderIds.length > 0 ? await this.expandFolderIds(folderIds) : undefined;

    const queryEmbedding = await this.embedder!.embed(query);
    if (queryEmbedding.every((v) => v === 0)) return [];

    const vecStr = JSON.stringify(queryEmbedding);
    const folderFilter = folderIds && folderIds.length > 0 ? ' AND d.folder_id = ANY($3)' : '';
    const joinClause = role !== 'admin' ? ' JOIN folders f ON d.folder_id = f.id' : '';
    const visibilityFilter = role !== 'admin' ? " AND f.visibility != 'private'" : '';

    const params: any[] = [vecStr, limit];
    if (folderIds && folderIds.length > 0) params.push(expandedIds);

    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.path, d.tags, d.summary, d.quality_score, d.created_by, d.updated_at,
              left(ch.content, 300) as snippet,
              ch.distance
       FROM (
         SELECT DISTINCT ON (document_id) document_id, content, ($1::vector <=> embedding) as distance
         FROM document_chunks
         WHERE embedding IS NOT NULL
         ORDER BY document_id, ($1::vector <=> embedding) ASC
       ) ch
       JOIN documents d ON ch.document_id = d.id${joinClause}
       WHERE ch.distance < $${params.length + 1}${visibilityFilter}${folderFilter}
       ORDER BY ch.distance
       LIMIT $2`,
      [...params, MemoryStorage.SIMILARITY_THRESHOLD],
    );
    return rows.map((r: any) => this.rowToSearchResult(r, 1 - (r.distance || 1), 'vector'));
  }

  private async keywordSearch(query: string, limit: number, role: Role, folderIds?: string[]): Promise<SearchResult[]> {
    const expandedIds = folderIds && folderIds.length > 0 ? await this.expandFolderIds(folderIds) : undefined;

    const folderFilter = folderIds && folderIds.length > 0 ? ' AND d.folder_id = ANY($3)' : '';
    const pattern = `%${query}%`;
    const joinClause = role !== 'admin' ? ' JOIN folders f ON d.folder_id = f.id' : '';
    const visibilityFilter = role !== 'admin' ? " AND f.visibility != 'private'" : '';

    const params: any[] = [pattern, limit];
    if (folderIds && folderIds.length > 0) params.push(expandedIds);

    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.path, d.tags, d.summary, d.quality_score, d.created_by, d.updated_at,
              substring(d.content from position($1 in d.content) - 50 for 200) as snippet
       FROM documents d${joinClause}
       WHERE (d.title ILIKE $1 OR d.content ILIKE $1 OR d.tags::text ILIKE $1)${visibilityFilter}${folderFilter}
       ORDER BY CASE WHEN d.title ILIKE $1 THEN 0 ELSE 1 END, d.updated_at DESC
       LIMIT $2`,
      params,
    );
    return rows.map((r: any) => this.rowToSearchResult(r, undefined, 'keyword'));
  }

  private rowToSearchResult(r: any, score?: number, source?: 'vector' | 'keyword' | 'hybrid'): SearchResult {
    return {
      id: r.id,
      title: r.title,
      path: r.path,
      snippet: r.snippet || '',
      tags: parseTags(r.tags),
      summary: r.summary || '',
      quality_score: Number(r.quality_score) || 0,
      created_by: r.created_by || '',
      updated_at: r.updated_at,
      score,
      source,
    };
  }

  async getStats(): Promise<{ document_count: number; folder_count: number }> {
    const docResult = await pool.query('SELECT COUNT(*) as count FROM documents');
    const folderResult = await pool.query('SELECT COUNT(*) as count FROM folders');
    return {
      document_count: Number(docResult.rows[0].count),
      folder_count: Number(folderResult.rows[0].count),
    };
  }

  // ── Promote to Public ──

  private static readonly ORG_ROOT_ID = '4797c0b0-0473-48e5-abda-7252f4b39318';

  async promoteToPublic(docId: string, category: string): Promise<Document | null> {
    const doc = await this.getDocument(docId);
    if (!doc) return null;

    // Find target folder by name under org root
    const { rows: folders } = await pool.query(
      'SELECT id FROM folders WHERE parent_id = $1 AND name = $2',
      [MemoryStorage.ORG_ROOT_ID, category],
    );
    if (folders.length === 0) {
      throw new Error(`Public category not found: ${category}`);
    }
    const targetFolderId = folders[0].id;

    // Check dedup: does target folder already have a doc with same hash?
    const hash = contentHash(doc.title, doc.content);
    const { rows: existing } = await pool.query(
      'SELECT id, title FROM documents WHERE folder_id = $1 AND content_hash = $2',
      [targetFolderId, hash],
    );
    if (existing.length > 0) {
      throw new Error(`内容已存在于公共区: ${existing[0].title}`);
    }

    // Insert directly into target folder (bypass createDocument dedup)
    const sourceBot = doc.path.split('/')[3] || '';
    const newTags = [...new Set([...doc.tags, 'promoted', `from:${sourceBot}`])];
    const docPath = await this.computeDocPath(targetFolderId, doc.title);
    const now = nowISO();
    const id = generateId();

    await pool.query(
      'INSERT INTO documents (id, title, folder_id, path, content, tags, summary, content_hash, quality_score, feedback_count, file_url, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
      [id, doc.title, targetFolderId, docPath, doc.content, JSON.stringify(newTags), doc.summary, hash, 0, 0, '', doc.created_by || sourceBot, now, now],
    );

    // Copy embedding asynchronously
    if (this.embedder && doc.content) {
      this.embedAndStore(id, `${doc.title}\n${doc.content}`).catch((err) => {
        this.logger.warn({ err: err.message, docId: id }, 'Failed to copy embedding');
      });
    }

    // Trigger index rebuild
    const { memoryEvents } = await import('./memory-events.js');
    memoryEvents.emitChange({ type: 'document_created', documentId: id });

    return {
      id,
      title: doc.title,
      folder_id: targetFolderId,
      path: docPath,
      content: doc.content,
      tags: newTags,
      summary: doc.summary,
      quality_score: 0,
      feedback_count: 0,
      created_by: doc.created_by || sourceBot,
      file_url: doc.file_url || '',
      created_at: now,
      updated_at: now,
    };
  }

  async suggestPromote(minScore = 4, minFeedback = 2, limit = 20): Promise<SearchResult[]> {
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.path, d.tags, d.summary, d.quality_score, d.created_by, d.updated_at,
              substring(d.content from 1 for 200) as snippet
       FROM documents d
       WHERE d.quality_score >= $1
         AND d.feedback_count >= $2
         AND d.path LIKE '/Root/数字员工/%'
         AND NOT (d.tags::text ILIKE '%promoted%')
       ORDER BY d.quality_score DESC, d.updated_at DESC
       LIMIT $3`,
      [minScore, minFeedback, limit],
    );
    return rows.map((r: any) => this.rowToSearchResult(r, Number(r.quality_score) / 5, 'keyword'));
  }

  close(): void {
    this.logger.info('MetaMemory storage closed');
  }
}
