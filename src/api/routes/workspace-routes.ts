import type { RouteHandler, RouteContext } from './types.js';
import { jsonResponse, readBody } from './helpers.js';
import { pool } from '../../db/index.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

export const handleWorkspaceRoutes: RouteHandler = async (ctx, req, res, method, url) => {
  const wm = ctx.workspaceManager;
  if (!wm) return false;

  const urlPath = url.split('?')[0];
  const qp = new URL(url, 'http://localhost').searchParams;

  // ── Org endpoints ──

  if (method === 'GET' && urlPath === '/api/workspace/org') {
    const org = await wm.ensureOrgWorkspace();
    const docCounts: Record<string, number> = {};
    for (const name of Object.keys(org.categories)) {
      const listed = await wm.listOrgDocs(name, 1, 0);
      docCounts[name] = listed.length;
    }
    jsonResponse(res, 200, {
      categories: wm.getOrgCategoryNames(),
      folderIds: Object.fromEntries(Object.entries(org.categories).map(([k, v]) => [k, v.id])),
      rootFolderId: org.rootFolderId,
      docCounts,
    });
    return true;
  }

  if (method === 'GET' && urlPath === '/api/workspace/org/documents') {
    const category = qp.get('category') || undefined;
    const limit = parseInt(qp.get('limit') || '50', 10);
    const offset = parseInt(qp.get('offset') || '0', 10);
    const docs = await wm.listOrgDocs(category, limit, offset);
    jsonResponse(res, 200, { documents: docs });
    return true;
  }

  if (method === 'POST' && urlPath === '/api/workspace/org/documents') {
    const body = JSON.parse(await readBody(req));
    if (!body.category || !body.title) {
      jsonResponse(res, 400, { error: 'category and title are required' });
      return true;
    }
    const doc = await wm.createOrgDoc(body.category, body.title, body.content || '', body.tags || []);
    jsonResponse(res, 201, { document: doc });
    return true;
  }

  const orgPutMatch = method === 'PUT' && urlPath.match(/^\/api\/workspace\/org\/documents\/([^/]+)$/);
  if (orgPutMatch) {
    const body = JSON.parse(await readBody(req));
    const doc = await wm.updateDoc(orgPutMatch[1], body);
    if (!doc) {
      jsonResponse(res, 404, { error: 'Document not found' });
      return true;
    }
    jsonResponse(res, 200, { document: doc });
    return true;
  }

  const orgDelMatch = method === 'DELETE' && urlPath.match(/^\/api\/workspace\/org\/documents\/([^/]+)$/);
  if (orgDelMatch) {
    const ok = await wm.deleteDoc(orgDelMatch[1]);
    jsonResponse(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Document not found' });
    return true;
  }

  if (method === 'POST' && urlPath === '/api/workspace/org/import') {
    const body = JSON.parse(await readBody(req));
    const { category, fileName, content, tags } = body;
    if (!category || !fileName || !content) {
      jsonResponse(res, 400, { error: 'category, fileName, and content are required' });
      return true;
    }
    const doc = await wm.createOrgDoc(category, fileName, content, tags || []);
    jsonResponse(res, 201, { document: doc });
    return true;
  }

  // ── Group endpoints ──

  // GET /api/workspace/group/:groupId
  const groupMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/group\/([^/]+)$/);
  if (groupMatch) {
    const groupId = groupMatch[1];
    const ws = await wm.ensureGroupWorkspace(groupId);
    const catMap = wm.getGroupCategoryMap();
    const docCounts: Record<string, number> = {};
    for (const key of Object.keys(catMap)) {
      const docs = await wm.listGroupDocs(groupId, key, 1, 0);
      docCounts[key] = docs.length;
    }
    jsonResponse(res, 200, {
      groupId,
      rootFolderId: ws.rootFolderId,
      rootPath: ws.rootPath,
      folderIds: Object.fromEntries(Object.entries(ws.categories).map(([k, v]) => [k, v.id])),
      categoryMap: catMap,
      docCounts,
    });
    return true;
  }

  // GET /api/workspace/group/:groupId/documents
  const groupDocsMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/group\/([^/]+)\/documents$/);
  if (groupDocsMatch) {
    const groupId = groupDocsMatch[1];
    const category = qp.get('category') || undefined;
    const limit = parseInt(qp.get('limit') || '50', 10);
    const offset = parseInt(qp.get('offset') || '0', 10);
    const docs = await wm.listGroupDocs(groupId, category, limit, offset);
    jsonResponse(res, 200, { documents: docs });
    return true;
  }

  // POST /api/workspace/group/:groupId/documents
  const groupCreateMatch = method === 'POST' && urlPath.match(/^\/api\/workspace\/group\/([^/]+)\/documents$/);
  if (groupCreateMatch) {
    const groupId = groupCreateMatch[1];
    const body = JSON.parse(await readBody(req));
    if (!body.category || !body.title) {
      jsonResponse(res, 400, { error: 'category and title are required' });
      return true;
    }
    const doc = await wm.createGroupDoc(groupId, body.category, body.title, body.content || '', body.tags || []);
    jsonResponse(res, 201, { document: doc });
    return true;
  }

  // DELETE /api/workspace/group/:groupId/documents/:docId
  const groupDelMatch = method === 'DELETE' && urlPath.match(/^\/api\/workspace\/group\/([^/]+)\/documents\/([^/]+)$/);
  if (groupDelMatch) {
    const ok = await wm.deleteDoc(groupDelMatch[2]);
    jsonResponse(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Document not found' });
    return true;
  }

  // ── Bot endpoints ──

  // ── Backlinks endpoint ──

  const backlinksMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/documents\/([^/]+)\/backlinks$/);
  if (backlinksMatch) {
    const docId = backlinksMatch[1];
    const doc = await pool.query('SELECT title FROM documents WHERE id = $1', [docId]);
    if (!doc.rows[0]) {
      jsonResponse(res, 404, { error: 'Document not found' });
      return true;
    }
    const title = doc.rows[0].title;
    const pattern = `%[[${title}]]%`;
    const { rows } = await pool.query(
      `SELECT id, title, folder_id, path, tags, created_by, created_at, updated_at
       FROM documents WHERE content ILIKE $1
       ORDER BY updated_at DESC LIMIT 20`,
      [pattern],
    );
    const parseTags = (t: any) => {
      if (Array.isArray(t)) return t;
      if (typeof t === 'string') {
        try {
          return JSON.parse(t);
        } catch {
          return [];
        }
      }
      return [];
    };
    jsonResponse(res, 200, { backlinks: rows.map((r: any) => ({ ...r, tags: parseTags(r.tags) })) });
    return true;
  }

  // ── Tags endpoint (before bot catch-all) ──

  if (method === 'GET' && urlPath === '/api/workspace/tags') {
    const { rows } = await pool.query(
      `SELECT jsonb_array_elements_text(tags) AS tag, COUNT(*) AS count
       FROM documents
       WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
       GROUP BY tag
       ORDER BY count DESC
       LIMIT 100`,
    );
    jsonResponse(res, 200, { tags: rows.map((r: any) => ({ name: r.tag, count: parseInt(r.count, 10) })) });
    return true;
  }

  const tagDocsMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/tags\/(.+)\/documents$/);
  if (tagDocsMatch) {
    const tag = decodeURIComponent(tagDocsMatch[1]);
    const limit = parseInt(qp.get('limit') || '50', 10);
    const offset = parseInt(qp.get('offset') || '0', 10);
    const { rows } = await pool.query(
      `SELECT id, title, folder_id, path, tags, created_by, created_at, updated_at
       FROM documents
       WHERE tags @> $1::jsonb
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [JSON.stringify([tag]), limit, offset],
    );
    const parseTags = (t: any) => {
      if (Array.isArray(t)) return t;
      if (typeof t === 'string') {
        try {
          return JSON.parse(t);
        } catch {
          return [];
        }
      }
      return [];
    };
    jsonResponse(res, 200, { documents: rows.map((r: any) => ({ ...r, tags: parseTags(r.tags) })) });
    return true;
  }

  const initMatch = method === 'POST' && urlPath.match(/^\/api\/workspace\/([^/]+)\/init$/);
  if (initMatch) {
    const ws = await wm.ensureBotWorkspace(initMatch[1]);
    jsonResponse(res, 200, {
      rootFolderId: ws.rootFolderId,
      rootPath: ws.rootPath,
      folderIds: Object.fromEntries(Object.entries(ws.categories).map(([k, v]) => [k, v.id])),
    });
    return true;
  }

  const botMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/([^/]+)$/);
  if (botMatch) {
    const botName = botMatch[1];
    const ws = await wm.ensureBotWorkspace(botName);
    const catMap = wm.getBotCategoryMap();
    const docCounts: Record<string, number> = {};
    for (const key of Object.keys(catMap)) {
      const docs = await wm.listBotDocs(botName, key, 1, 0);
      docCounts[key] = docs.length;
    }
    const projects = await wm.listBotProjects(botName);
    jsonResponse(res, 200, {
      botName,
      rootFolderId: ws.rootFolderId,
      rootPath: ws.rootPath,
      folderIds: Object.fromEntries(Object.entries(ws.categories).map(([k, v]) => [k, v.id])),
      categoryMap: catMap,
      docCounts,
      projects,
    });
    return true;
  }

  const docsMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/([^/]+)\/documents$/);
  if (docsMatch) {
    const category = qp.get('category') || undefined;
    const limit = parseInt(qp.get('limit') || '50', 10);
    const offset = parseInt(qp.get('offset') || '0', 10);
    const docs = await wm.listBotDocs(docsMatch[1], category, limit, offset);
    jsonResponse(res, 200, { documents: docs });
    return true;
  }

  const createDocMatch = method === 'POST' && urlPath.match(/^\/api\/workspace\/([^/]+)\/documents$/);
  if (createDocMatch) {
    const body = JSON.parse(await readBody(req));
    if (!body.category || !body.title) {
      jsonResponse(res, 400, { error: 'category and title are required' });
      return true;
    }
    const doc = await wm.createBotDoc(
      createDocMatch[1],
      body.category,
      body.title,
      body.content || '',
      body.tags || [],
    );
    jsonResponse(res, 201, { document: doc });
    return true;
  }

  const updateDocMatch = method === 'PUT' && urlPath.match(/^\/api\/workspace\/([^/]+)\/documents\/([^/]+)$/);
  if (updateDocMatch) {
    const body = JSON.parse(await readBody(req));
    const doc = await wm.updateDoc(updateDocMatch[2], body);
    if (!doc) {
      jsonResponse(res, 404, { error: 'Document not found' });
      return true;
    }
    jsonResponse(res, 200, { document: doc });
    return true;
  }

  const delDocMatch = method === 'DELETE' && urlPath.match(/^\/api\/workspace\/([^/]+)\/documents\/([^/]+)$/);
  if (delDocMatch) {
    const ok = await wm.deleteDoc(delDocMatch[2]);
    jsonResponse(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Document not found' });
    return true;
  }

  const importMatch = method === 'POST' && urlPath.match(/^\/api\/workspace\/([^/]+)\/import$/);
  if (importMatch) {
    const body = JSON.parse(await readBody(req));
    const { category, fileName, content, tags } = body;
    if (!category || !fileName || !content) {
      jsonResponse(res, 400, { error: 'category, fileName, and content are required' });
      return true;
    }
    const doc = await wm.createBotDoc(importMatch[1], category, fileName, content, tags || []);
    jsonResponse(res, 201, { document: doc });
    return true;
  }

  // ── Bot Project endpoints ──

  // GET /api/workspace/:botName/projects
  const projectsMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/([^/]+)\/projects$/);
  if (projectsMatch) {
    const projects = await wm.listBotProjects(projectsMatch[1]);
    jsonResponse(res, 200, { projects });
    return true;
  }

  // POST /api/workspace/:botName/projects/:projectName/documents
  const projDocCreate = method === 'POST' && urlPath.match(/^\/api\/workspace\/([^/]+)\/projects\/([^/]+)\/documents$/);
  if (projDocCreate) {
    const body = JSON.parse(await readBody(req));
    if (!body.title) {
      jsonResponse(res, 400, { error: 'title is required' });
      return true;
    }
    const doc = await wm.createBotProjectDoc(
      projDocCreate[1],
      decodeURIComponent(projDocCreate[2]),
      body.title,
      body.content || '',
      body.tags || [],
    );
    jsonResponse(res, 201, { document: doc });
    return true;
  }

  // GET /api/workspace/:botName/projects/:projectName/documents
  const projDocsMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/([^/]+)\/projects\/([^/]+)\/documents$/);
  if (projDocsMatch) {
    const limit = parseInt(qp.get('limit') || '50', 10);
    const offset = parseInt(qp.get('offset') || '0', 10);
    const docs = await wm.listBotProjectDocs(projDocsMatch[1], decodeURIComponent(projDocsMatch[2]), limit, offset);
    jsonResponse(res, 200, { documents: docs });
    return true;
  }

  // ── Index endpoints ──

  // GET /api/workspace/index/:scope  (scope = org | bot:botName | group:groupId)
  const indexMatch = method === 'GET' && urlPath.match(/^\/api\/workspace\/index\/(.+)$/);
  if (indexMatch) {
    const doc = await wm.getIndex(indexMatch[1]);
    if (!doc) {
      jsonResponse(res, 404, { error: 'Index not found' });
      return true;
    }
    const resolved = await wm.resolveLinks(doc.content);
    jsonResponse(res, 200, { index: doc, resolvedContent: resolved });
    return true;
  }

  // ── File import with parsing (DOCX/XLSX/PDF → text → document) ──

  if (method === 'POST' && urlPath === '/api/workspace/import-file') {
    const body = JSON.parse(await readBody(req));
    const {
      filename,
      content: fileContentB64,
      folderId,
      tags,
    } = body as {
      filename: string;
      content: string;
      folderId: string;
      tags?: string[];
    };
    if (!filename || !fileContentB64 || !folderId) {
      jsonResponse(res, 400, { error: 'filename, content (base64), folderId required' });
      return true;
    }

    const ext = path.extname(filename).toLowerCase();
    const buffer = Buffer.from(fileContentB64, 'base64');
    let textContent = '';

    try {
      if (ext === '.docx') {
        const mammoth = await import('mammoth');
        const tmpFile = path.join(os.tmpdir(), `ws-import-${Date.now()}.docx`);
        fs.writeFileSync(tmpFile, buffer);
        const result = await mammoth.default.extractRawText({ path: tmpFile });
        textContent = result.value;
        fs.unlinkSync(tmpFile);
      } else if (ext === '.xlsx' || ext === '.xls') {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer);
        const parts: string[] = [];
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          parts.push(`## ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`);
        }
        textContent = parts.join('\n\n');
      } else if (ext === '.pdf') {
        // PDF: extract text via pdf-parse if available, otherwise raw binary fallback
        try {
          const { PDFParse } = await import('pdf-parse');
          const parser: any = new PDFParse(new Uint8Array(buffer));
          await parser.load();
          const pdfData = await parser.getText();
          textContent = pdfData.text;
        } catch {
          textContent = buffer
            .toString('utf-8')
            .replace(/[^\x20-\x7E\u4e00-\u9fff\n]/g, ' ')
            .trim();
        }
      } else {
        // Plain text files
        textContent = buffer.toString('utf-8');
      }
    } catch (err: any) {
      jsonResponse(res, 400, { error: `Failed to parse ${ext} file: ${err.message}` });
      return true;
    }

    if (!textContent.trim()) {
      jsonResponse(res, 400, { error: 'No text content extracted from file' });
      return true;
    }

    const title = filename.replace(/\.[^.]+$/, '');
    const docTags = [...(tags || []), 'imported', ext.replace('.', '')];

    // Find the workspace that owns this folder
    const folder = await ctx.workspaceManager!.resolveWorkspaceByFolderId(folderId);
    let doc;
    if (folder.scope === 'org') {
      const catName = folder.categoryName || '组织资料';
      doc = await wm.createOrgDoc(catName, title, textContent, docTags);
    } else if (folder.scope.startsWith('bot:')) {
      doc = await wm.createBotDoc(
        folder.scope.slice(4),
        folder.categoryName || 'knowledge',
        title,
        textContent,
        docTags,
      );
    } else if (folder.scope.startsWith('group:')) {
      doc = await wm.createGroupDoc(
        folder.scope.slice(6),
        folder.categoryName || 'knowledge',
        title,
        textContent,
        docTags,
      );
    } else {
      // Fallback: create directly in folder
      const storage = (wm as any).storage;
      doc = await storage.createDocument({ title, content: textContent, tags: docTags, folder_id: folderId });
    }

    jsonResponse(res, 200, { document: doc });
    return true;
  }

  return false;
};
