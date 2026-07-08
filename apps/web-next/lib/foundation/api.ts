/**
 * R13-C · Foundation shared client (2026-07-08)
 *
 * 所有 foundation 子模块共享的 fetcher + 类型。
 * 用法: import { mf, type MemoryItem } from "@/lib/foundation/api";
 */
import { api } from "@/lib/api";

// ── memory ──────────────────────────────────────────────────────────────
export interface MemoryItem {
  id: string;
  layer: number;
  subject: string | null;
  subject_normalized?: string | null;
  content: string | null;
  preview?: string | null;
  importance: number | null;
  type: string | null;
  polarity: string | null;
  tags: string[];
  botId: string | null;
  tenantId: string | null;
  userId?: string | null;
  hitCount: number;
  accessCount?: number;
  confidence?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastHitAt?: string | null;
  lastAccessed?: string | null;
  supersededBy?: string | null;
  invalidatedAt?: string | null;
}

export interface MemoryListParams {
  q?: string;
  limit?: number;
  offset?: number;
  botId?: string;
  minImportance?: number;
}

export interface MemoryListResponse {
  success: boolean;
  layer: number;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  memories: MemoryItem[];
}

export const mf = {
  // memory list (GET /:layer)
  async listMemory(layer: 1 | 2 | 3, params: MemoryListParams = {}): Promise<MemoryListResponse> {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    if (params.botId) qs.set("botId", params.botId);
    if (params.minImportance !== undefined) qs.set("min_importance", String(params.minImportance));
    const query = qs.toString();
    return api<MemoryListResponse>(`/api/v2/foundation/memory/l${layer}${query ? `?${query}` : ""}`);
  },

  // memory detail
  async getMemory(id: string): Promise<{ success: boolean; memory: MemoryItem }> {
    return api(`/api/v2/foundation/memory/item/${encodeURIComponent(id)}`);
  },

  // memory create
  async createMemory(body: {
    layer: 1 | 2 | 3;
    content: string;
    importance?: number;
    subject?: string;
    type?: string;
    tags?: string[];
    botId?: string;
  }): Promise<{ success: boolean; memory: MemoryItem }> {
    return api(`/api/v2/foundation/memory`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  },

  // memory patch
  async patchMemory(
    id: string,
    body: Partial<Pick<MemoryItem, "layer" | "importance" | "content" | "subject" | "type" | "polarity">> & { tags?: string[] },
  ): Promise<{ success: boolean; memory: MemoryItem }> {
    return api(`/api/v2/foundation/memory/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  },

  // memory delete
  async deleteMemory(id: string): Promise<{ success: boolean; deleted: string }> {
    return api(`/api/v2/foundation/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  // folders tree
  async foldersTree(): Promise<{ success: boolean; folders: FolderItem[] }> {
    return api(`/api/v2/foundation/folders/tree`);
  },

  async createFolder(body: { name: string; parentId?: string | null; visibility?: string; botId?: string | null }): Promise<{ success: boolean; folder: FolderItem }> {
    return api(`/api/v2/foundation/folders`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  },

  async patchFolder(id: string, body: { name?: string; parentId?: string | null; visibility?: string; botId?: string | null }): Promise<{ success: boolean; folder: FolderItem }> {
    return api(`/api/v2/foundation/folders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  },

  async deleteFolder(id: string, mode: "cascade" | "reassign" = "reassign"): Promise<{ success: boolean; deleted: string }> {
    return api(`/api/v2/foundation/folders/${encodeURIComponent(id)}?mode=${mode}`, { method: "DELETE" });
  },

  // documents
  async getDocument(id: string): Promise<{ success: boolean; document: DocumentItem }> {
    return api(`/api/v2/foundation/documents/${encodeURIComponent(id)}`);
  },

  async listDocumentsByFolder(folderId: string | null): Promise<{ success: boolean; documents: DocumentItem[] }> {
    // 注意:这个端点要前端层自己做 client filter(避免新增后端 list 端点)
    // 实际从 folders/tree 的 docCount + 单独的搜索 API 派生
    const all = await mf.allDocuments();
    return { success: true, documents: all.documents.filter((d) => (folderId ? d.folderId === folderId : !d.folderId)) };
  },

  async allDocuments(limit = 500): Promise<{ success: boolean; documents: DocumentItem[] }> {
    // 用 knowledge-base-routes 已有的 listKbDocuments 不合适(需要 kbId)
    // 简化:从一个特殊端点取所有 docs — 后端没有就退化为 folders/tree 不能拿 doc
    // → 这里加个轻量 list 端点 (在 foundation-kb-routes.ts 里)
    return api(`/api/v2/foundation/documents?limit=${limit}`);
  },

  async getDocumentChunks(id: string, limit = 200, offset = 0): Promise<{ success: boolean; chunks: ChunkItem[]; total: number }> {
    return api(`/api/v2/foundation/documents/${encodeURIComponent(id)}/chunks?limit=${limit}&offset=${offset}`);
  },

  async patchDocument(id: string, body: { title?: string; tags?: string[]; module?: string; visibility?: string; folderId?: string | null }): Promise<{ success: boolean; document: DocumentItem }> {
    return api(`/api/v2/foundation/documents/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  },

  async deleteDocument(id: string): Promise<{ success: boolean; deleted: string }> {
    return api(`/api/v2/foundation/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async reindexDocument(id: string): Promise<{ success: boolean; message: string }> {
    return api(`/api/v2/foundation/documents/${encodeURIComponent(id)}/reindex`, { method: "POST" });
  },

  async uploadDocument(body: { title: string; content: string; folderId?: string | null; module?: string; tags?: string[]; visibility?: string }): Promise<{ success: boolean; document: DocumentItem; chunkCount: number }> {
    return api(`/api/v2/foundation/documents/upload`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  },
};

// ── types ───────────────────────────────────────────────────────────────
export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  visibility?: string;
  botId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  docCount?: number;
}

export interface DocumentItem {
  id: string;
  title: string;
  folderId: string | null;
  path: string;
  content?: string;
  summary?: string;
  tags?: string[] | string;
  qualityScore?: number;
  hitCount?: number;
  lastHitAt?: string;
  version?: string;
  versionGroup?: string;
  kbId?: string;
  kbType?: string;
  module?: string;
  visibility?: string;
  kbVersion?: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  botId?: string | null;
  feedbackCount?: number;
  chunkCount?: number;
  chunkTokens?: number;
  folderName?: string;
  folderPath?: string;
}

export interface ChunkItem {
  id: string;
  chunkIndex: number;
  heading?: string;
  content: string;
  tokens?: number;
  createdAt?: string;
}

// ── helpers ─────────────────────────────────────────────────────────────
export function fmtRel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export function tagsToString(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.filter((t) => typeof t === "string").map(String);
  if (typeof tags === "string") {
    try {
      const p = JSON.parse(tags);
      return Array.isArray(p) ? p.map(String) : [tags];
    } catch {
      return [tags];
    }
  }
  return [];
}
