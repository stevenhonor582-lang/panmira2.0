/**
 * Workspace Syncer — Phase 21
 * Scans workspace outputs/ for new .md files after task completion,
 * syncs them to DB documents table with content_hash dedup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { Logger } from '../utils/logger.js';
import { pool } from '../db/index.js';

const TEXT_EXTENSIONS = new Set(['.md','.txt','.json','.csv','.yaml','.yml','.html']);
const MAX_FILE_BYTES = 500 * 1024; // 500KB max per file

export class WorkspaceSyncer {
  private logger: Logger;
  private lastSync = new Map<string, number>(); // per project path → last sync timestamp

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Scan a bot's workspace projects/ subdirs for new output files.
   * Call after task completion — fire-and-forget.
   */
  async sync(botName: string, workDir: string): Promise<{ scanned: number; synced: number }> {
    const projectsDir = path.join(workDir, 'projects');
    if (!fs.existsSync(projectsDir)) return { scanned: 0, synced: 0 };

    const files: Array<{ fpath: string; project: string; mtime: number }> = [];
    const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const proj of projectDirs) {
      const outputsDir = path.join(projectsDir, proj.name, 'outputs');
      if (!fs.existsSync(outputsDir)) continue;
      const last = this.lastSync.get(outputsDir) || 0;
      const entries = fs.readdirSync(outputsDir, { withFileTypes: true, recursive: true })
        .filter(e => e.isFile());
      for (const e of entries) {
        try {
          const fpath = path.join(e.parentPath || outputsDir, e.name);
          const stat = fs.statSync(fpath);
          if (stat.mtimeMs <= last) continue; // already synced
          const ext = path.extname(e.name).toLowerCase();
          if (!TEXT_EXTENSIONS.has(ext)) continue;
          if (stat.size > MAX_FILE_BYTES) continue;
          files.push({ fpath, project: proj.name, mtime: stat.mtimeMs });
        } catch {}
      }
    }

    if (files.length === 0) return { scanned: 0, synced: 0 };
    this.logger.info({ botName, fileCount: files.length }, 'WorkspaceSyncer: scanning new files');

    // 2) Read files and compute content_hashes
    const hashes: string[] = [];
    const payloads: Array<{ fpath: string; project: string; title: string; content: string; hash: string }> = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(f.fpath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 20);
        hashes.push(hash);
        payloads.push({
          fpath: f.fpath,
          project: f.project,
          title: path.basename(f.fpath, path.extname(f.fpath)), // strip extension
          content,
          hash,
        });
      } catch {}
    }
    if (payloads.length === 0) return { scanned: files.length, synced: 0 };

    // 3) Dedup — query existing hashes
    let existingHashes: Set<string> = new Set();
    try {
      const { rows } = await pool.query(
        `SELECT content_hash FROM documents WHERE content_hash = ANY($1)`,
        [hashes],
      );
      existingHashes = new Set(rows.map((r: any) => r.content_hash));
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'WorkspaceSyncer: hash lookup failed');
    }

    // 4) Insert new documents
    let synced = 0;
    for (const p of payloads) {
      if (existingHashes.has(p.hash)) continue;
      try {
        // Get folder ID for bot's project folder
        const projectFolderPath = `/数字员工/${botName}/项目/${p.project}`;
        const { rows: folderRows } = await pool.query(
          `SELECT id FROM folders WHERE path = $1 LIMIT 1`,
          [projectFolderPath],
        );
        const folderId = folderRows.length > 0 ? folderRows[0].id : null;
        if (!folderId) {
          // Create the project folder if it doesn't exist
          const { rows: projectParent } = await pool.query(
            `SELECT id FROM folders WHERE path = $1 LIMIT 1`,
            [`/数字员工/${botName}/项目`],
          );
          if (projectParent.length === 0) continue;
          const newId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO folders (id, name, parent_id, path, visibility, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'shared', NOW(), NOW())`,
            [newId, p.project, projectParent[0].id, projectFolderPath, p.project],
          );
          // Use new folder
          await this.createDocument(p.title, p.content, newId, p.hash, botName);
        } else {
          await this.createDocument(p.title, p.content, folderId, p.hash, botName);
        }
        synced++;
      } catch (err: any) {
        this.logger.warn({ err: err?.message, title: p.title }, 'WorkspaceSyncer: insert failed');
      }
    }

    // 5) Update last sync time for each project dir
    for (const f of files) {
      const dir = path.join(projectsDir, f.project, 'outputs');
      const cur = this.lastSync.get(dir) || 0;
      if (f.mtime > cur) this.lastSync.set(dir, f.mtime);
    }

    this.logger.info(
      { botName, scanned: files.length, synced },
      `WorkspaceSyncer: ${synced}/${files.length} new files synced`,
    );
    return { scanned: files.length, synced };
  }

  private async createDocument(
    title: string, content: string, folderId: string, hash: string, createdBy: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const docPath = `${folderId}/${id}`; // approximate
    await pool.query(
      `INSERT INTO documents (id, title, folder_id, path, content, content_hash, tags, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (content_hash) DO NOTHING`,
      [id, title, folderId, docPath, content, hash,
       JSON.stringify(['bot-output', createdBy]), createdBy, now, now],
    );
  }
}
