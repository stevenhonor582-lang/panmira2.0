import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from './utils/logger.js';

interface SkeletonConfig {
  directories: string[];
  claudeMd: string;
  knowledgeFolders: string[];
  initialFiles: Record<string, string>;
}

const SKELETON_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'workspace-skeleton.json');

function loadSkeleton(): SkeletonConfig {
  const raw = fs.readFileSync(SKELETON_PATH, 'utf-8');
  return JSON.parse(raw) as SkeletonConfig;
}

export function initWorkspaceSkeleton(
  workDir: string,
  botName: string,
  displayName: string,
  logger?: Logger,
): { dirs: number; files: number; knowledgeFolders: string[] } {
  const skeleton = loadSkeleton();
  let dirs = 0;
  let files = 0;

  // Create directory structure
  for (const dir of skeleton.directories) {
    const full = path.join(workDir, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
      dirs++;
    }
  }

  // Generate CLAUDE.md
  const claudePath = path.join(workDir, 'CLAUDE.md');
  if (!fs.existsSync(claudePath)) {
    const content = skeleton.claudeMd
      .replace(/\{botName\}/g, botName)
      .replace(/\{displayName\}/g, displayName)
      .replace(/\{workDir\}/g, workDir);
    fs.writeFileSync(claudePath, content, 'utf-8');
    files++;
  }

  // Create initial files
  for (const [relPath, content] of Object.entries(skeleton.initialFiles)) {
    const full = path.join(workDir, relPath);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf-8');
      files++;
    }
  }

  logger?.info({ botName, dirs, files }, 'Workspace skeleton initialized');
  return { dirs, files, knowledgeFolders: skeleton.knowledgeFolders };
}
