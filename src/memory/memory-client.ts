import type { Logger } from '../utils/logger.js';
import { proxyFetch } from '../utils/http.js';

export interface FolderTreeNode {
  id: string;
  name: string;
  path: string;
  children: FolderTreeNode[];
  document_count: number;
}

export interface DocumentSummary {
  id: string;
  title: string;
  folder_id: string;
  path: string;
  tags: string[];
  summary: string;
  quality_score: number;
  file_url: string;
  created_by: string;
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
  updated_at: string;
  score?: number;
  source?: 'vector' | 'keyword' | 'hybrid';
}

export interface FullDocument {
  id: string;
  title: string;
  folder_id: string;
  path: string;
  content: string;
  tags: string[];
  summary: string;
  quality_score: number;
  file_url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HealthStatus {
  status: string;
  document_count: number;
  folder_count: number;
}

export class MemoryClient {
  constructor(
    private baseUrl: string,
    private logger: Logger,
    private secret?: string,
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.secret) {
      headers['Authorization'] = `Bearer ${this.secret}`;
    }
    const res = await proxyFetch(url, {
      headers: { ...headers, ...options?.headers },
      ...options,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Memory API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async health(): Promise<HealthStatus> {
    const raw = await this.request<unknown>('/api/health');
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      return {
        status: String(obj.status || 'unknown'),
        document_count: Number(obj.document_count || 0),
        folder_count: Number(obj.folder_count || 0),
      };
    }
    return { status: 'unknown', document_count: 0, folder_count: 0 };
  }

  async listFolderTree(): Promise<FolderTreeNode> {
    const raw = await this.request<unknown>('/api/folders');
    return this.unwrapSingle<FolderTreeNode>(raw, 'folders');
  }

  async listDocuments(folderId?: string, limit = 50): Promise<DocumentSummary[]> {
    const params = new URLSearchParams();
    if (folderId) params.set('folder_id', folderId);
    params.set('limit', String(limit));
    const raw = await this.request<unknown>(`/api/documents?${params}`);
    return this.unwrapArray<DocumentSummary>(raw, 'documents');
  }

  async getDocument(docId: string): Promise<FullDocument | null> {
    try {
      const raw = await this.request<unknown>(`/api/documents/${docId}`);
      if (raw && typeof raw === 'object') {
        const doc = (raw as any).document || raw;
        return {
          id: doc.id,
          title: doc.title,
          folder_id: doc.folder_id,
          path: doc.path,
          content: doc.content || '',
          summary: doc.summary || '',
          quality_score: Number(doc.quality_score) || 0,
          tags: Array.isArray(doc.tags) ? doc.tags : [],
          created_by: doc.created_by || '',
          file_url: doc.file_url || '',
          created_at: doc.created_at || '',
          updated_at: doc.updated_at || '',
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const raw = await this.request<unknown>(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return this.unwrapArray<SearchResult>(raw, 'results');
  }

  async searchInFolders(query: string, folderIds: string[], limit = 20): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      folder_ids: folderIds.join(','),
    });
    const raw = await this.request<unknown>(`/api/search?${params}`);
    return this.unwrapArray<SearchResult>(raw, 'results');
  }

  async createFolder(name: string, parentId = 'root'): Promise<string | null> {
    try {
      const raw = await this.request<unknown>('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: parentId }),
      });
      const obj = raw as Record<string, unknown>;
      return (obj.id as string) || null;
    } catch {
      return null;
    }
  }

  async createDocument(data: {
    title: string;
    content: string;
    folder_id: string;
    tags?: string[];
    path?: string;
    created_by?: string;
  }): Promise<boolean> {
    try {
      await this.request<unknown>('/api/documents', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return true;
    } catch {
      return false;
    }
  }

  async findFolderByName(name: string): Promise<string | null> {
    try {
      const tree = await this.listFolderTree();
      const children = tree.children || [];
      const match = children.find((c) => c.name === name);
      return match?.id || null;
    } catch {
      return null;
    }
  }

  async ensureFolder(name: string, parentId = 'root'): Promise<string | null> {
    const existing = await this.findFolderByName(name);
    if (existing) return existing;
    return this.createFolder(name, parentId);
  }


  async submitFeedback(docId: string, score: number): Promise<{ quality_score: number; feedback_count: number } | null> {
    try {
      const raw = await this.request<unknown>(`/api/documents/${docId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ score }),
      });
      return raw as { quality_score: number; feedback_count: number };
    } catch {
      return null;
    }
  }

  async findRelated(docId: string, limit = 10): Promise<SearchResult[]> {
    const raw = await this.request<unknown>(`/api/documents/${docId}/related?limit=${limit}`);
    return this.unwrapArray<SearchResult>(raw, 'results');
  }

  async findStale(days = 30): Promise<any[]> {
    const raw = await this.request<unknown>(`/api/documents/stale?days=${days}`);
    if (Array.isArray(raw)) return raw as any[];
    return [];
  }

  /** Format folder tree as indented text for Feishu card display */
  formatFolderTree(node: FolderTreeNode, depth = 0): string {
    if (!node || typeof node !== 'object') return 'No folder data available.';
    const name = node.name || 'unknown';
    const children = Array.isArray(node.children) ? node.children : [];
    const docCount = node.document_count || 0;
    const indent = '  '.repeat(depth);
    const icon = children.length > 0 ? '📂' : '📁';
    const count = docCount > 0 ? ` (${docCount})` : '';
    let result = `${indent}${icon} ${name}${count}
`;
    for (const child of children) {
      result += this.formatFolderTree(child, depth + 1);
    }
    return result;
  }

  /** Format search results as text for Feishu card display */
  formatSearchResults(results: SearchResult[]): string {
    if (!Array.isArray(results) || results.length === 0) return 'No results found.';
    return results
      .map((r, i) => {
        const tags = Array.isArray(r.tags) && r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : '';
        // Strip HTML tags from snippet
        const snippet = (r.snippet || '').replace(/<[^>]*>/g, '');
        return `${i + 1}. **${r.title}**${tags}
   ${snippet}`;
      })
      .join('\n\n');
  }

  async promoteToPublic(docId: string, category: string): Promise<{ id: string; title: string; path: string } | null> {
    try {
      const raw = await this.request<unknown>(`/api/documents/${docId}/promote`, {
        method: 'POST',
        body: JSON.stringify({ category }),
      });
      return raw as { id: string; title: string; path: string };
    } catch {
      return null;
    }
  }

  async suggestPromote(minScore = 4, minFeedback = 2): Promise<SearchResult[]> {
    const raw = await this.request<unknown>(`/api/documents/suggest-promote?min_score=${minScore}&min_feedback=${minFeedback}`);
    return this.unwrapArray<SearchResult>(raw, 'results');
  }

  /**
   * Unwrap API responses that may come as:
   * - A plain array: [...]
   * - An object with a specific key: { <key>: [...] }
   * - An object with 'results' key: { results: [...] }
   */
  private unwrapArray<T>(data: unknown, key: string): T[] {
    if (Array.isArray(data)) return data as T[];
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj[key])) return obj[key] as T[];
      if (Array.isArray(obj.results)) return obj.results as T[];
      if (Array.isArray(obj.data)) return obj.data as T[];
    }
    this.logger.warn({ responseType: typeof data, key }, 'Unexpected array response format from memory server');
    return [];
  }

  /**
   * Unwrap single-object API responses that may come as:
   * - The object directly: { id, name, ... }
   * - Wrapped in a key: { <key>: { id, name, ... } }
   */
  private unwrapSingle<T>(data: unknown, key: string): T {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      // If the response has the expected key, return its value
      if (obj[key] && typeof obj[key] === 'object') return obj[key] as T;
      // If the response looks like the object itself (has expected fields), return directly
      if ('id' in obj || 'name' in obj || 'path' in obj || 'children' in obj) return data as T;
    }
    this.logger.warn({ responseType: typeof data, key }, 'Unexpected single-object response format from memory server');
    // Return a safe fallback
    return { id: '', name: 'root', path: '/', children: [], document_count: 0 } as unknown as T;
  }
}
