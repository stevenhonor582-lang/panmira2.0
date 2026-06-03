import type { MemoryStorage, DocumentCreateInput, DocumentUpdateInput, Role, Visibility, StaleDocument } from './memory-storage.js';
import type { DocEmbedder } from './doc-embedder.js';
import { memoryEvents } from './memory-events.js';

interface RouteResult {
  status: number;
  body: unknown;
}

// --- Folder routes ---

export async function handleGetFolders(storage: MemoryStorage, role: Role): Promise<RouteResult> {
  const tree = await storage.getFolderTree(role);
  return { status: 200, body: tree };
}

export async function handleCreateFolder(
  storage: MemoryStorage,
  body: Record<string, unknown>,
  role: Role,
): Promise<RouteResult> {
  const name = body.name as string | undefined;
  if (!name) {
    return { status: 400, body: { detail: 'name is required' } };
  }
  const parentId = (body.parent_id as string) || 'root';
  const visibility = (body.visibility as Visibility) || 'shared';
  // Only admin can create private folders
  if (visibility === 'private' && role !== 'admin') {
    return { status: 403, body: { detail: 'Only admin can create private folders' } };
  }
  try {
    const folder = await storage.createFolder(name, parentId, visibility);
    memoryEvents.emitChange({ type: 'folder_created', folderId: folder.id });
    return { status: 201, body: folder };
  } catch (err: any) {
    return { status: 400, body: { detail: err.message } };
  }
}

export async function handleUpdateFolder(
  storage: MemoryStorage,
  folderId: string,
  body: Record<string, unknown>,
  role: Role,
): Promise<RouteResult> {
  if (role !== 'admin') {
    return { status: 403, body: { detail: 'Only admin can update folder settings' } };
  }
  const data: { visibility?: Visibility } = {};
  if (body.visibility !== undefined) data.visibility = body.visibility as Visibility;
  const folder = await storage.updateFolder(folderId, data);
  if (!folder) return { status: 404, body: { detail: 'Folder not found' } };
  return { status: 200, body: folder };
}

export async function handleDeleteFolder(storage: MemoryStorage, folderId: string, role: Role): Promise<RouteResult> {
  if (role !== 'admin') {
    if (!storage.isFolderAccessible(folderId, role)) {
      return { status: 403, body: { detail: 'Access denied' } };
    }
  }
  try {
    await storage.deleteFolder(folderId);
    memoryEvents.emitChange({ type: 'folder_deleted', folderId });
    return { status: 200, body: { ok: true } };
  } catch (err: any) {
    if (err.message.includes('Cannot delete root')) {
      return { status: 400, body: { detail: err.message } };
    }
    if (err.message.includes('not found')) {
      return { status: 404, body: { detail: err.message } };
    }
    return { status: 400, body: { detail: err.message } };
  }
}

// --- Document routes ---

export async function handleListDocuments(
  storage: MemoryStorage,
  query: URLSearchParams,
  role: Role,
): Promise<RouteResult> {
  const folderId = query.get('folder_id') || undefined;
  const limit = Math.min(Math.max(parseInt(query.get('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(query.get('offset') || '0', 10) || 0, 0);
  const docs = await storage.listDocuments(folderId, limit, offset, role);
  return { status: 200, body: docs };
}

export async function handleGetDocument(storage: MemoryStorage, docId: string, role: Role): Promise<RouteResult> {
  const doc = await storage.getDocument(docId, role);
  if (!doc) return { status: 404, body: { detail: 'Document not found' } };
  return { status: 200, body: doc };
}

export async function handleGetDocumentByPath(
  storage: MemoryStorage,
  query: URLSearchParams,
  role: Role,
): Promise<RouteResult> {
  const docPath = query.get('path');
  if (!docPath) return { status: 400, body: { detail: 'path query parameter is required' } };
  const doc = await storage.getDocumentByPath(docPath, role);
  if (!doc) return { status: 404, body: { detail: 'Document not found' } };
  return { status: 200, body: doc };
}

export async function handleCreateDocument(
  storage: MemoryStorage,
  body: Record<string, unknown>,
  role: Role,
): Promise<RouteResult> {
  const title = body.title as string | undefined;
  if (!title) {
    return { status: 400, body: { detail: 'title is required' } };
  }

  const data: DocumentCreateInput = {
    title,
    folder_id: (body.folder_id as string) || 'root',
    content: (body.content as string) || '',
    tags: Array.isArray(body.tags) ? body.tags : [],
    created_by: (body.created_by as string) || '',
  };

  try {
    const doc = await storage.createDocument(data, role);
    memoryEvents.emitChange({ type: 'document_created', documentId: doc.id });
    return { status: 201, body: doc };
  } catch (err: any) {
    if (err.message.includes('Access denied')) {
      return { status: 403, body: { detail: err.message } };
    }
    return { status: 400, body: { detail: err.message } };
  }
}

export async function handleUpdateDocument(
  storage: MemoryStorage,
  docId: string,
  body: Record<string, unknown>,
  role: Role,
): Promise<RouteResult> {
  const data: DocumentUpdateInput = {};
  if (body.title !== undefined) data.title = body.title as string;
  if (body.content !== undefined) data.content = body.content as string;
  if (body.tags !== undefined) data.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.folder_id !== undefined) data.folder_id = body.folder_id as string;

  const doc = await storage.updateDocument(docId, data, role);
  if (!doc) return { status: 404, body: { detail: 'Document not found' } };
  memoryEvents.emitChange({ type: 'document_updated', documentId: docId });
  return { status: 200, body: doc };
}

export async function handleDeleteDocument(storage: MemoryStorage, docId: string, role: Role): Promise<RouteResult> {
  const deleted = await storage.deleteDocument(docId, role);
  if (!deleted) return { status: 404, body: { detail: 'Document not found' } };
  memoryEvents.emitChange({ type: 'document_deleted', documentId: docId });
  return { status: 200, body: { ok: true } };
}

// --- Search ---

export async function handleSearch(storage: MemoryStorage, query: URLSearchParams, role: Role): Promise<RouteResult> {
  const q = query.get('q');
  if (!q || q.trim().length === 0) {
    return { status: 400, body: { detail: 'q query parameter is required' } };
  }
  const limit = Math.min(Math.max(parseInt(query.get('limit') || '20', 10) || 20, 1), 100);
  const folderIdsStr = query.get('folder_ids');
  const folderIds = folderIdsStr ? folderIdsStr.split(',').filter(Boolean) : undefined;
  const results = await storage.searchDocuments(q, limit, role, folderIds);
  return { status: 200, body: results };
}

// --- Health ---

export async function handleHealth(storage: MemoryStorage, embedder?: DocEmbedder): Promise<RouteResult> {
  const stats = await storage.getStats();
  const body: Record<string, unknown> = { status: 'ok', ...stats };
  if (embedder) {
    const embHealth = await embedder.healthCheck();
    body.embedding = embHealth;
  }
  return { status: 200, body };
}


// ── Quality Feedback ──

export async function handleSubmitFeedback(
  storage: MemoryStorage,
  docId: string,
  body: Record<string, unknown>,
): Promise<RouteResult> {
  const score = Number(body.score);
  if (isNaN(score) || score < 1 || score > 5) {
    return { status: 400, body: { detail: 'score must be a number between 1 and 5' } };
  }
  const result = await storage.submitFeedback(docId, score);
  if (!result) return { status: 404, body: { detail: 'Document not found' } };
  return { status: 200, body: result };
}

// ── Related Documents ──

export async function handleRelatedDocuments(storage: MemoryStorage, docId: string): Promise<RouteResult> {
  const results = await storage.findRelatedDocuments(docId, 10);
  return { status: 200, body: results };
}

// ── Stale Documents ──

export async function handleStaleDocuments(storage: MemoryStorage, query: URLSearchParams): Promise<RouteResult> {
  const days = parseInt(query.get('days') || '30', 10);
  const minLength = parseInt(query.get('min_length') || '50', 10);
  const results = await storage.findStaleDocuments(days, minLength);
  return { status: 200, body: results };
}

// ── Promote to Public ──

export async function handlePromoteDocument(
  storage: MemoryStorage,
  docId: string,
  body: Record<string, unknown>,
): Promise<RouteResult> {
  const category = body.category as string;
  if (!category) {
    return { status: 400, body: { detail: 'category is required' } };
  }
  try {
    const doc = await storage.promoteToPublic(docId, category);
    if (!doc) return { status: 404, body: { detail: 'Document not found' } };
    return { status: 201, body: doc };
  } catch (err: any) {
    return { status: 400, body: { detail: err.message } };
  }
}

export async function handleSuggestPromote(storage: MemoryStorage, query: URLSearchParams): Promise<RouteResult> {
  const minScore = parseFloat(query.get('min_score') || '4');
  const minFeedback = parseInt(query.get('min_feedback') || '2', 10);
  const limit = Math.min(parseInt(query.get('limit') || '20', 10), 50);
  const results = await storage.suggestPromote(minScore, minFeedback, limit);
  return { status: 200, body: results };
}
