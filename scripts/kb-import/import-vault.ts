/**
 * VMT 知识库导入 MetaMemory 脚本
 *
 * 用法: npx tsx import-vault.ts [--dry-run] [--reset]
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);

const MEMORY_URL = process.env.META_MEMORY_URL || "http://localhost:8100";
const MEMORY_TOKEN = process.env.MEMORY_ADMIN_TOKEN || "memory_admin_token_vmt";
const VAULT_PATH = process.env.VAULT_PATH || "/data/vmt-kb";

const DRY_RUN = process.argv.includes("--dry-run");
const RESET = process.argv.includes("--reset");

const EXCLUDED_DIRS = new Set([
  ".git", ".obsidian", ".claude", ".trash",
  "node_modules", "assets", "tools", "scripts", "wiki-ai",
]);

// 目录映射: [本地目录, MetaMemory路径, visibility]
const DIR_MAP: [string, string, string][] = [
  ["00-导航", "/组织公共区/VMT知识库/导航", "shared"],
  ["R0-品牌规范", "/组织公共区/VMT知识库/品牌规范", "shared"],
  ["R1-竞品库", "/组织公共区/VMT知识库/竞品库", "private"],
  ["R2-客户库", "/组织公共区/VMT知识库/客户库", "private"],
  ["R3-卖法手册", "/组织公共区/VMT知识库/卖法手册", "private"],
  ["R4-技术库", "/组织公共区/VMT知识库/技术库", "shared"],
  ["R5-产品库", "/组织公共区/VMT知识库/产品库", "shared"],
  ["templates", "/组织公共区/VMT知识库/模板", "shared"],
  ["plan", "/组织公共区/VMT知识库/方案文档", "private"],
];

interface HashRecord { hash: string; docId?: string; imported_at: string; }
interface ImportStats { total: number; created: number; updated: number; skipped: number; errors: number; }

async function api(method: string, endpoint: string, body?: unknown): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(MEMORY_TOKEN ? { Authorization: `Bearer ${MEMORY_TOKEN}` } : {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${MEMORY_URL}${endpoint}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${endpoint} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function getFolderTree(): Promise<any> {
  return api("GET", "/api/folders");
}

function findFolderByPath(tree: any, targetPath: string): { id: string } | null {
  function search(node: any): { id: string } | null {
    if (node.path === targetPath || node.path === `/${targetPath}`) return node;
    if (node.children) for (const child of node.children) { const r = search(child); if (r) return r; }
    return null;
  }
  return search(tree);
}

async function ensureFolder(folderPath: string, visibility: string): Promise<string> {
  if (DRY_RUN) return "dry-run-id";
  const tree = await getFolderTree();
  const existing = findFolderByPath(tree, folderPath);
  if (existing) return existing.id;

  const parts = folderPath.split("/").filter(Boolean);
  let parentId = "root";
  for (let i = 0; i < parts.length; i++) {
    const partialPath = "/" + parts.slice(0, i + 1).join("/");
    const tree2 = await getFolderTree();
    const found = findFolderByPath(tree2, partialPath);
    if (found) { parentId = found.id; continue; }
    const created = await api("POST", "/api/folders", {
      name: parts[i], parent_id: parentId, visibility,
    });
    parentId = created.id;
    console.log(`  + 文件夹: ${partialPath}`);
  }
  return parentId;
}

function buildTags(fm: Record<string, any>, filePath: string): string[] {
  const tags: string[] = [];
  if (Array.isArray(fm.keywords)) tags.push(...fm.keywords);
  if (fm.category && typeof fm.category === "string") tags.push(`cat:${fm.category}`);
  if (fm.subcategory && typeof fm.subcategory === "string") tags.push(`subcat:${fm.subcategory}`);
  if (fm.doc_type && typeof fm.doc_type === "string") tags.push(`type:${fm.doc_type}`);
  if (fm.status && typeof fm.status === "string") tags.push(`status:${fm.status}`);
  if (filePath.includes("R1-竞品") || filePath.includes("竞品")) tags.push("竞品分析");
  if (filePath.includes("R2-客户") || filePath.includes("客户")) tags.push("客户案例");
  if (filePath.includes("R3-卖法")) tags.push("销售");
  if (filePath.includes("按材料") || filePath.includes("材料数据")) tags.push("材料");
  if (filePath.includes("表面处理")) tags.push("表面处理");
  if (filePath.includes("质检")) tags.push("质检品控");
  if (filePath.includes("认证")) tags.push("认证体系");
  if (filePath.includes("设备")) tags.push("设备能力");
  return [...new Set(tags)].slice(0, 50);
}

// 返回 [远程文件夹, visibility, 本地顶层目录名]
function getDirConfig(filePath: string): [string, string, string] | null {
  for (const [localDir, remoteFolder, visibility] of DIR_MAP) {
    if (filePath === localDir || filePath.startsWith(localDir + "/")) {
      return [remoteFolder, visibility, localDir];
    }
  }
  return null;
}

async function importFile(
  filePath: string,
  hashRecords: Record<string, HashRecord>,
  folderCache: Map<string, string>,
  stats: ImportStats,
) {
  const content = fs.readFileSync(filePath, "utf-8");
  const hash = crypto.createHash("md5").update(content).digest("hex");
  const relativePath = path.relative(VAULT_PATH, filePath).replace(/\\/g, "/");

  const existing = hashRecords[relativePath];
  if (existing && existing.hash === hash && !DRY_RUN) {
    stats.skipped++;
    if (stats.total % 50 === 0) console.log(`  ...已扫描 ${stats.total} 文件`);
    return;
  }

  let fm: Record<string, any> = {};
  let body: string = content;
  try { const parsed = matter(content); fm = parsed.data; body = parsed.content; } catch {}

  const docTitle = fm.title || path.basename(filePath, ".md");
  const dirConfig = getDirConfig(relativePath);
  if (!dirConfig) { stats.skipped++; return; }
  const [baseFolder, visibility, localRoot] = dirConfig;

  // 计算 MetaMemory 目标文件夹
  const subDir = path.dirname(relativePath).replace(/\\/g, "/");
  let targetFolder: string;
  if (subDir === "." || subDir === localRoot) {
    targetFolder = baseFolder;
  } else {
    const relSub = path.relative(localRoot, subDir).replace(/\\/g, "/");
    targetFolder = `${baseFolder}/${relSub}`;
  }

  if (!folderCache.has(targetFolder)) {
    const folderId = await ensureFolder(targetFolder, visibility);
    folderCache.set(targetFolder, folderId);
  }

  const tags = buildTags(fm, relativePath);
  const docBody = body.trim() || "(empty)";

  if (DRY_RUN) {
    if (stats.total <= 10 || stats.total % 50 === 0) {
      console.log(`  [DRY RUN] ${docTitle} -> ${targetFolder}  [${tags.length} tags]`);
    }
    stats.created++;
    hashRecords[relativePath] = { hash, imported_at: new Date().toISOString() };
    return;
  }

  const folderId = folderCache.get(targetFolder)!;
  let existingDoc: any = null;
  try {
    existingDoc = await api("GET", `/api/documents/by-path?path=${encodeURIComponent(relativePath)}`);
  } catch {}

  if (existingDoc) {
    await api("PUT", `/api/documents/${existingDoc.id}`, {
      title: docTitle, content: docBody, tags, folder_id: folderId,
    });
    stats.updated++;
  } else {
    await api("POST", "/api/documents", {
      title: docTitle, content: docBody, tags, folder_id: folderId,
      path: relativePath, created_by: "kb-import",
    });
    stats.created++;
    if (stats.created % 20 === 0) console.log(`  ...已导入 ${stats.created} 文件`);
  }
  hashRecords[relativePath] = { hash, docId: existingDoc?.id, imported_at: new Date().toISOString() };
}

async function walkDir(
  dir: string,
  hashRecords: Record<string, HashRecord>,
  folderCache: Map<string, string>,
  stats: ImportStats,
) {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, hashRecords, folderCache, stats);
    } else if (entry.name.endsWith(".md")) {
      stats.total++;
      try { await importFile(full, hashRecords, folderCache, stats); } catch (e) {
        stats.errors++;
        console.error(`\n  [ERROR] ${path.relative(VAULT_PATH, full)}: ${(e as Error).message}`);
      }
    }
  }
}

function getSubdirs(dir: string): string[] {
  const result: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) result.push(entry.name);
    }
  } catch {}
  return result;
}

async function main() {
  console.log("=== VMT 知识库导入 MetaMemory ===\n");
  if (DRY_RUN) console.log("[DRY RUN — 试运行模式，不会实际写入]\n");

  const hashFile = path.join(SCRIPT_DIR, ".import-hashes.json");
  let hashRecords: Record<string, HashRecord> = {};
  if (!RESET && fs.existsSync(hashFile)) {
    try {
      hashRecords = JSON.parse(fs.readFileSync(hashFile, "utf-8"));
      console.log(`加载 ${Object.keys(hashRecords).length} 条历史 hash 记录\n`);
    } catch { console.log("hash 记录损坏，全量导入\n"); }
  } else {
    console.log("无历史记录，全量导入\n");
  }

  console.log("--- 创建文件夹结构 ---");
  const folderCache = new Map<string, string>();
  for (const [, folderPath, visibility] of DIR_MAP) {
    const id = await ensureFolder(folderPath, visibility);
    folderCache.set(folderPath, id);
  }

  console.log("\n--- 扫描子目录 ---");
  for (const [dir, folderPath, visibility] of DIR_MAP) {
    const fullDir = path.join(VAULT_PATH, dir);
    if (!fs.existsSync(fullDir)) { console.log(`  [跳过] ${dir}`); continue; }
    const subs = getSubdirs(fullDir);
    for (const sub of subs) {
      const subPath = `${folderPath}/${sub}`;
      if (!folderCache.has(subPath)) {
        await ensureFolder(subPath, visibility);
        folderCache.set(subPath, "");
      }
    }
    console.log(`  ${dir}: ${subs.length} 个子目录`);
  }

  console.log("\n--- 导入文件 ---");
  const stats: ImportStats = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
  for (const [dir] of DIR_MAP) {
    const fullDir = path.join(VAULT_PATH, dir);
    if (!fs.existsSync(fullDir)) continue;
    await walkDir(fullDir, hashRecords, folderCache, stats);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(hashFile, JSON.stringify(hashRecords, null, 2));
    console.log(`\n已保存 ${Object.keys(hashRecords).length} 条 hash 记录`);
  }

  console.log(`\n=== 完成 ===`);
  console.log(`  扫描: ${stats.total}  新增: ${stats.created}  更新: ${stats.updated}  跳过: ${stats.skipped}  错误: ${stats.errors}`);
}

main().catch((e) => {
  console.error("导入失败:", e);
  process.exit(1);
});
