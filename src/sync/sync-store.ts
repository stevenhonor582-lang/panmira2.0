import { pool } from '../db/index.js';
import type { Logger } from '../utils/logger.js';

export interface SyncMapping {
  memoryDocId: string;
  memoryPath: string;
  feishuNodeToken: string;
  feishuDocId: string;
  contentHash: string;
  syncedAt: string;
}

export interface FolderMapping {
  memoryFolderId: string;
  memoryPath: string;
  feishuNodeToken: string;
}

export interface SyncConfig {
  wikiSpaceId: string;
  rootNodeToken?: string;
  lastFullSyncAt?: string;
}

export class SyncStore {
  constructor(
    private databaseDir: string,
    private logger: Logger,
  ) {
    this.logger.info('Sync store initialized');
  }

  async getConfig(key: string): Promise<string | undefined> {
    const result = await pool.query('SELECT value FROM sync_config WHERE key = $1', [key]);
    return result.rows[0]?.value;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await pool.query('INSERT INTO sync_config (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2', [
      key,
      value,
    ]);
  }

  async getWikiSpaceId(): Promise<string | undefined> {
    return this.getConfig('wiki_space_id');
  }

  async setWikiSpaceId(spaceId: string): Promise<void> {
    await this.setConfig('wiki_space_id', spaceId);
  }

  async getDocMapping(memoryDocId: string): Promise<SyncMapping | undefined> {
    const result = await pool.query('SELECT * FROM document_mappings WHERE memory_doc_id = $1', [memoryDocId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      memoryDocId: row.memory_doc_id,
      memoryPath: row.memory_path,
      feishuNodeToken: row.feishu_node_token,
      feishuDocId: row.feishu_doc_id,
      contentHash: row.content_hash,
      syncedAt: row.synced_at,
    };
  }

  async getDocMappingByPath(memoryPath: string): Promise<SyncMapping | undefined> {
    const result = await pool.query('SELECT * FROM document_mappings WHERE memory_path = $1', [memoryPath]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      memoryDocId: row.memory_doc_id,
      memoryPath: row.memory_path,
      feishuNodeToken: row.feishu_node_token,
      feishuDocId: row.feishu_doc_id,
      contentHash: row.content_hash,
      syncedAt: row.synced_at,
    };
  }

  async upsertDocMapping(mapping: SyncMapping): Promise<void> {
    await pool.query(
      `INSERT INTO document_mappings (memory_doc_id, memory_path, feishu_node_token, feishu_doc_id, content_hash, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(memory_doc_id) DO UPDATE SET
         memory_path = $2, feishu_node_token = $3, feishu_doc_id = $4, content_hash = $5, synced_at = $6`,
      [
        mapping.memoryDocId,
        mapping.memoryPath,
        mapping.feishuNodeToken,
        mapping.feishuDocId,
        mapping.contentHash,
        mapping.syncedAt,
      ],
    );
  }

  async deleteDocMapping(memoryDocId: string): Promise<void> {
    await pool.query('DELETE FROM document_mappings WHERE memory_doc_id = $1', [memoryDocId]);
  }

  async getAllDocMappings(): Promise<SyncMapping[]> {
    const result = await pool.query('SELECT * FROM document_mappings');
    return result.rows.map((row: any) => ({
      memoryDocId: row.memory_doc_id,
      memoryPath: row.memory_path,
      feishuNodeToken: row.feishu_node_token,
      feishuDocId: row.feishu_doc_id,
      contentHash: row.content_hash,
      syncedAt: row.synced_at,
    }));
  }

  async getFolderMapping(memoryFolderId: string): Promise<FolderMapping | undefined> {
    const result = await pool.query('SELECT * FROM folder_mappings WHERE memory_folder_id = $1', [memoryFolderId]);
    const row: any = result.rows[0];
    if (!row) return undefined;
    return {
      memoryFolderId: row.memory_folder_id,
      memoryPath: row.memory_path,
      feishuNodeToken: row.feishu_node_token,
    };
  }

  async upsertFolderMapping(mapping: FolderMapping): Promise<void> {
    await pool.query(
      `INSERT INTO folder_mappings (memory_folder_id, memory_path, feishu_node_token)
       VALUES ($1, $2, $3)
       ON CONFLICT(memory_folder_id) DO UPDATE SET
         memory_path = $2, feishu_node_token = $3`,
      [mapping.memoryFolderId, mapping.memoryPath, mapping.feishuNodeToken],
    );
  }

  async deleteFolderMapping(memoryFolderId: string): Promise<void> {
    await pool.query('DELETE FROM folder_mappings WHERE memory_folder_id = $1', [memoryFolderId]);
  }

  async getAllFolderMappings(): Promise<FolderMapping[]> {
    const result = await pool.query('SELECT * FROM folder_mappings');
    return result.rows.map((row: any) => ({
      memoryFolderId: row.memory_folder_id,
      memoryPath: row.memory_path,
      feishuNodeToken: row.feishu_node_token,
    }));
  }

  async getStats(): Promise<{ documentCount: number; folderCount: number; wikiSpaceId: string | undefined }> {
    const docResult = await pool.query('SELECT COUNT(*) as count FROM document_mappings');
    const folderResult = await pool.query('SELECT COUNT(*) as count FROM folder_mappings');
    return {
      documentCount: Number(docResult.rows[0].count),
      folderCount: Number(folderResult.rows[0].count),
      wikiSpaceId: await this.getWikiSpaceId(),
    };
  }

  async clearAll(): Promise<void> {
    await pool.query('DELETE FROM document_mappings');
    await pool.query('DELETE FROM folder_mappings');
    await pool.query('DELETE FROM sync_config');
  }

  close(): void {
    this.logger.info('Sync store closed');
  }
}
