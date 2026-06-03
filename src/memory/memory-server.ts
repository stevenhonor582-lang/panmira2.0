import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as url from 'node:url';
import type { Logger } from '../utils/logger.js';
import { MemoryStorage } from './memory-storage.js';
import type { Role } from './memory-storage.js';
import { DocEmbedder } from './doc-embedder.js';
import { AutoTagger } from './auto-tagger.js';
import {
  handleGetFolders,
  handleCreateFolder,
  handleUpdateFolder,
  handleDeleteFolder,
  handleListDocuments,
  handleGetDocument,
  handleGetDocumentByPath,
  handleCreateDocument,
  handleUpdateDocument,
  handleDeleteDocument,
  handleSearch,
  handleHealth,
  handleSubmitFeedback,
  handleRelatedDocuments,
  handleStaleDocuments,
  handlePromoteDocument,
  handleSuggestPromote,
} from './memory-routes.js';

export interface MemoryServerOptions {
  port: number;
  databaseDir: string;
  secret?: string;
  adminToken?: string;
  readerToken?: string;
  logger: Logger;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(json);
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new PayloadTooLargeError());
        return;
      }
      resolve(Buffer.concat(chunks).toString());
    });
    req.on('error', reject);
  });
}

class PayloadTooLargeError extends Error {
  statusCode = 413;
  constructor() {
    super('Request body too large (max 10 MB)');
  }
}

async function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Invalid JSON in request body'), { statusCode: 400 });
  }
}

// Resolve the static directory — works for both src/ (tsx) and dist/ (compiled)
function resolveStaticDir(): string {
  const thisFile = url.fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);

  // When running from src/ via tsx
  const srcStatic = path.join(thisDir, 'static');
  if (fs.existsSync(srcStatic)) return srcStatic;

  // When running from dist/ (compiled), static files are at dist/memory/static
  const distStatic = path.join(thisDir, '..', 'memory', 'static');
  if (fs.existsSync(distStatic)) return distStatic;

  return srcStatic; // fallback
}

export function startMemoryServer(options: MemoryServerOptions): { server: http.Server; storage: MemoryStorage } {
  const { port, databaseDir, secret, adminToken, readerToken, logger } = options;
  const embedder = new DocEmbedder(logger);
  // Eager health check (non-blocking, logs result)
  embedder.healthCheck().then((result) => {
    if (result.ok) {
      logger.info({ model: result.model, baseUrl: result.baseUrl }, 'Embedding provider health check: OK');
    } else if (result.configured) {
      logger.error({ model: result.model, error: result.error }, 'Embedding provider health check: FAILED (provider configured but unreachable)');
    } else {
      logger.warn('Embedding provider health check: NOT CONFIGURED (embeddings disabled)');
    }
  });
  const autoTagger = new AutoTagger(logger);
  const storage = new MemoryStorage(databaseDir, logger, embedder, autoTagger);
  const staticDir = resolveStaticDir();

  // Auth is enabled if any token is configured
  const authEnabled = !!(adminToken || readerToken || secret);

  /** Resolve role from Authorization header.
   *  - adminToken → 'admin'
   *  - readerToken or legacy secret → 'reader'
   *  - No tokens configured → 'admin' (backward compatible, open access)
   *  - Invalid/missing token when auth enabled → null (reject)
   */
  function resolveRole(req: http.IncomingMessage): Role | null {
    if (!authEnabled) return 'admin'; // No auth configured → full access

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) return null;
    if (adminToken && token === adminToken) return 'admin';
    if (readerToken && token === readerToken) return 'reader';
    // Legacy: old secret token gets admin access for backward compat
    if (secret && token === secret) return 'admin';
    return null; // invalid token
  }

  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const rawUrl = req.url || '/';
    const parsed = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsed.pathname;
    const query = parsed.searchParams;

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    try {
      // --- API Routes ---

      // Health (no auth needed)
      if (method === 'GET' && pathname === '/api/health') {
        const result = await handleHealth(storage, embedder);
        jsonResponse(res, result.status, result.body);
        return;
      }

      // Resolve role for authenticated API routes
      let role: Role = 'admin';
      if (pathname.startsWith('/api/')) {
        const resolved = resolveRole(req);
        if (resolved === null) {
          jsonResponse(res, 401, { detail: 'Unauthorized' });
          return;
        }
        role = resolved;
      }

      // Folders
      if (method === 'GET' && pathname === '/api/folders') {
        const result = await handleGetFolders(storage, role);
        jsonResponse(res, result.status, result.body);
        return;
      }
      if (method === 'POST' && pathname === '/api/folders') {
        const body = await parseJsonBody(req);
        const result = await handleCreateFolder(storage, body, role);
        jsonResponse(res, result.status, result.body);
        return;
      }
      if (method === 'PUT' && pathname.startsWith('/api/folders/')) {
        const folderId = decodeURIComponent(pathname.slice('/api/folders/'.length));
        const body = await parseJsonBody(req);
        const result = await handleUpdateFolder(storage, folderId, body, role);
        jsonResponse(res, result.status, result.body);
        return;
      }
      if (method === 'DELETE' && pathname.startsWith('/api/folders/')) {
        const folderId = decodeURIComponent(pathname.slice('/api/folders/'.length));
        const result = await handleDeleteFolder(storage, folderId, role);
        jsonResponse(res, result.status, result.body);
        return;
      }

      // Documents
      if (method === 'GET' && pathname === '/api/documents/by-path') {
        const result = await handleGetDocumentByPath(storage, query, role);
        jsonResponse(res, result.status, result.body);
        return;
      }
      if (method === 'GET' && pathname === '/api/documents') {
        const result = await handleListDocuments(storage, query, role);
        jsonResponse(res, result.status, result.body);
        return;
      }

      // Related documents (before catch-all /api/documents/:id)
      if (method === 'GET' && pathname.startsWith('/api/documents/') && pathname.endsWith('/related')) {
        const docId = decodeURIComponent(pathname.slice('/api/documents/'.length, -'/related'.length));
        const result = await handleRelatedDocuments(storage, docId);
        jsonResponse(res, result.status, result.body);
        return;
      }

      // Suggest promote (before catch-all)
      if (method === 'GET' && pathname === '/api/documents/suggest-promote') {
        const result = await handleSuggestPromote(storage, query);
        jsonResponse(res, result.status, result.body);
        return;
      }

            // Stale documents (before catch-all)
      if (method === 'GET' && pathname === '/api/documents/stale') {
        const result = await handleStaleDocuments(storage, query);
        jsonResponse(res, result.status, result.body);
        return;
      }

      // Feedback
      if (method === 'POST' && pathname.startsWith('/api/documents/') && pathname.endsWith('/feedback')) {
        const docId = decodeURIComponent(pathname.slice('/api/documents/'.length, -'/feedback'.length));
        const body = await parseJsonBody(req);
        const result = await handleSubmitFeedback(storage, docId, body);
        jsonResponse(res, result.status, result.body);
        return;
      }

      if (method === 'GET' && pathname.startsWith('/api/documents/')) {
        const docId = decodeURIComponent(pathname.slice('/api/documents/'.length));
        const result = await handleGetDocument(storage, docId, role);
        jsonResponse(res, result.status, result.body);
        return;
      }
      if (method === 'POST' && pathname === '/api/documents') {
        const body = await parseJsonBody(req);
        const result = await handleCreateDocument(storage, body, role);
        jsonResponse(res, result.status, result.body);
        return;
      }
      if (method === 'PUT' && pathname.startsWith('/api/documents/')) {
        const docId = decodeURIComponent(pathname.slice('/api/documents/'.length));
        const body = await parseJsonBody(req);
        const result = await handleUpdateDocument(storage, docId, body, role);
        jsonResponse(res, result.status, result.body);
        return;
      }
      if (method === 'DELETE' && pathname.startsWith('/api/documents/')) {
        const docId = decodeURIComponent(pathname.slice('/api/documents/'.length));
        const result = await handleDeleteDocument(storage, docId, role);
        jsonResponse(res, result.status, result.body);
        return;
      }

      // Search
      if (method === 'GET' && pathname === '/api/search') {
        const result = await handleSearch(storage, query, role);
        jsonResponse(res, result.status, result.body);
        return;
      }

      // --- Static files ---
      if (method === 'GET') {
        let filePath: string;
        if (pathname === '/' || pathname === '') {
          filePath = path.join(staticDir, 'index.html');
        } else {
          // Prevent path traversal
          const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
          filePath = path.join(staticDir, normalized);
          if (!filePath.startsWith(staticDir)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }
        }

        try {
          const content = fs.readFileSync(filePath);
          const ext = path.extname(filePath);
          const mime = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
          });
          res.end(content);
          return;
        } catch {
          // File not found — fall through to 404
        }
      }



      // Promote to public
      if (method === 'POST' && pathname.startsWith('/api/documents/') && pathname.endsWith('/promote')) {
        const docId = decodeURIComponent(pathname.slice('/api/documents/'.length, -'/promote'.length));
        const body = await parseJsonBody(req);
        const result = await handlePromoteDocument(storage, docId, body);
        jsonResponse(res, result.status, result.body);
        return;
      }

      // 404 fallback
      jsonResponse(res, 404, { detail: 'Not found' });
    } catch (err: any) {
      if (typeof err?.statusCode === 'number') {
        jsonResponse(res, err.statusCode, { detail: err.message || 'Request error' });
        return;
      }
      logger.error({ err, method, url: rawUrl }, 'MetaMemory request error');
      jsonResponse(res, 500, { detail: err.message || 'Internal server error' });
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn({ port }, 'MetaMemory port already in use, retrying in 3s (old process may still be running)');
      setTimeout(() => {
        server.close();
        server.listen(port, '0.0.0.0');
      }, 3000);
    } else {
      logger.error({ err, port }, 'MetaMemory server error');
    }
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'MetaMemory server started');
    // Show access URL with token for easy browser access
    const authToken = adminToken || secret;
    const baseUrl = `http://localhost:${port}`;
    if (authToken) {
      logger.info({ url: `${baseUrl}?token=${authToken}` }, 'MetaMemory Web UI (token embedded)');
    } else {
      logger.info({ url: baseUrl }, 'MetaMemory Web UI (no auth)');
    }
  });

  return { server, storage };
}
