import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as http from 'node:http';
import { jsonResponse } from './helpers.js';
import type { RouteContext } from './types.js';

const ROOT_DIR = process.env.PROJECT_ROOT || '/home/ubuntu';

const ALLOWED_DIRS = new Set(['/home/ubuntu/workspace', '/home/ubuntu/dev', '/home/ubuntu/metabot']);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.css',
  '.html',
  '.yaml',
  '.yml',
  '.txt',
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.toml',
  '.env',
  '.example',
  '.gitignore',
  '.sql',
  '.prisma',
  '.graphql',
  '.vue',
  '.svelte',
  '.cjs',
  '.mjs',
]);

function isChildOf(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isAllowed(dir: string): boolean {
  if (ALLOWED_DIRS.has(dir)) return true;
  for (const allowed of ALLOWED_DIRS) {
    if (isChildOf(allowed, dir)) return true;
  }
  return false;
}

function getFileIcon(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const icons: Record<string, string> = {
    '.ts': 'TS',
    '.tsx': 'TX',
    '.js': 'JS',
    '.json': '{}',
    '.md': 'MD',
    '.css': 'CS',
    '.html': 'HT',
    '.py': 'PY',
    '.yaml': 'YL',
    '.yml': 'YL',
    '.sh': 'SH',
    '.sql': 'DB',
    '.env': 'EN',
  };
  return icons[ext] || 'F';
}

export async function handleProjectRoutes(
  _ctx: RouteContext,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (!url.startsWith('/api/projects')) return false;

  // GET /api/projects/roots
  if (method === 'GET' && url === '/api/projects/roots') {
    const roots = Array.from(ALLOWED_DIRS)
      .map((dir) => {
        const name = path.basename(dir);
        try {
          const stat = fs.statSync(dir);
          return { name, path: dir, modified: stat.mtime.toISOString() };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    jsonResponse(res, 200, { roots });
    return true;
  }

  // GET /api/projects/list?dir=xxx
  if (method === 'GET' && url.startsWith('/api/projects/list')) {
    const params = new URL(url, 'http://localhost').searchParams;
    const dir = params.get('dir') || '';
    if (!dir || !isAllowed(dir) || !fs.existsSync(dir)) {
      jsonResponse(res, 400, { error: 'Invalid or disallowed directory' });
      return true;
    }
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const items = entries
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
        .map((e) => {
          const fullPath = path.join(dir, e.name);
          try {
            const stat = fs.statSync(fullPath);
            return {
              name: e.name,
              path: fullPath,
              isDirectory: e.isDirectory(),
              size: e.isFile() ? stat.size : 0,
              modified: stat.mtime.toISOString(),
              icon: e.isDirectory() ? 'D' : getFileIcon(e.name),
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      items.sort((a: any, b: any) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      jsonResponse(res, 200, { items, path: dir });
    } catch (e: any) {
      jsonResponse(res, 500, { error: e.message });
    }
    return true;
  }

  // GET /api/projects/read?path=xxx
  if (method === 'GET' && url.startsWith('/api/projects/read')) {
    const params = new URL(url, 'http://localhost').searchParams;
    const filePath = params.get('path') || '';
    if (!filePath || !isAllowed(filePath)) {
      jsonResponse(res, 400, { error: 'Invalid or disallowed path' });
      return true;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !filePath.endsWith('.gitignore') && !filePath.endsWith('.example')) {
      jsonResponse(res, 400, { error: 'File type not supported for reading' });
      return true;
    }
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        jsonResponse(res, 400, { error: 'Not a file' });
        return true;
      }
      if (stat.size > 500_000) {
        const content = fs.readFileSync(filePath, 'utf-8').slice(0, 500_000) + '\n... (truncated)';
        jsonResponse(res, 200, { content, size: stat.size, truncated: true });
        return true;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      jsonResponse(res, 200, { content, size: stat.size, truncated: false });
    } catch (e: any) {
      jsonResponse(res, 500, { error: e.message });
    }
    return true;
  }

  return false;
}
