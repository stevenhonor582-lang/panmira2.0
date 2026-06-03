/**
 * VMT 知识库导入 MetaMemory — v2
 * 修复: 文件夹路径 = /VMT知识库/...，利用 API 幂等创建
 * 用法: npx tsx import-vault-v2.ts [--dry-run] [--reset]
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import matter from "gray-matter";

const MEMORY_URL = "http://localhost:8100";
const MEMORY_TOKEN = "memory_admin_token_vmt";
const VAULT_PATH = "/data/vmt-kb";

const DRY_RUN = process.argv.includes("--dry-run");
const RESET = process.argv.includes("--reset");

const BASE = "/VMT知识库";

// [本地目录, 相对子路径, visibility]
const DIR_MAP: [string, string, string][] = [
  ["00-导航", "/导航", "shared"],
  ["R0-品牌规范", "/品牌规范", "shared"],
  ["R1-竞品库", "/竞品库", "private"],
  ["R2-客户库", "/客户库", "private"],
  ["R3-卖法手册", "/卖法手册", "private"],
  ["R4-技术库", "/技术库", "shared"],
  ["R5-产品库", "/产品库", "shared"],
  ["templates", "/模板", "shared"],
  ["plan", "/方案文档", "private"],
];

interface HashRecord { hash: string; imported_at: string; }

async function api(method: string, ep: string, body?: unknown): Promise<any> {
  const res = await fetch(`${MEMORY_URL}${ep}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MEMORY_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${method} ${ep} -> ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function ensureFolder(fullPath: string, visibility: string): Promise<string> {
  // fullPath 如 "/VMT知识库/技术库/材料数据"
  if (DRY_RUN) return "dry-id";

  const parts = fullPath.split("/").filter(Boolean);
  let parentId = "root";

  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    // API 按 (parent_id, name) 组合计算 path，重复则返回已有
    const created = await api("POST", "/api/folders", {
      name,
      parent_id: parentId,
      visibility,
    });
    parentId = created.id;
    if (i === 0) console.log(`  + ${fullPath}`);
  }
  return parentId;
}

function buildTags(fm: Record<string, any>, filePath: string): string[] {
  const tags: string[] = [];
  if (Array.isArray(fm.keywords)) tags.push(...fm.keywords);
  if (fm.category) tags.push(`cat:${fm.category}`);
  if (fm.subcategory) tags.push(`subcat:${fm.subcategory}`);
  if (fm.doc_type) tags.push(`type:${fm.doc_type}`);
  if (fm.status) tags.push(`status:${fm.status}`);
  if (filePath.includes("竞品")) tags.push("竞品分析");
  if (filePath.includes("客户")) tags.push("客户案例");
  if (filePath.includes("卖法")) tags.push("销售");
  if (filePath.includes("材料")) tags.push("材料");
  if (filePath.includes("表面处理")) tags.push("表面处理");
  if (filePath.includes("质检")) tags.push("质检品控");
  if (filePath.includes("认证")) tags.push("认证体系");
  if (filePath.includes("设备")) tags.push("设备能力");
  return [...new Set(tags)].slice(0, 50);
}

// 缓存: 远程路径 → folder_id
const folderIdCache = new Map<string, string>();

async function getOrCreateFolder(remotePath: string, visibility: string): Promise<string> {
  if (folderIdCache.has(remotePath)) return folderIdCache.get(remotePath)!;
  const id = await ensureFolder(remotePath, visibility);
  folderIdCache.set(remotePath, id);
  return id;
}

async function importOne(
  filePath: string,
  hashes: Record<string, HashRecord>,
  stats: { total: number; created: number; updated: number; skipped: number; errors: number },
) {
  const content = fs.readFileSync(filePath, "utf-8");
  const hash = crypto.createHash("md5").update(content).digest("hex");
  const rel = path.relative(VAULT_PATH, filePath).replace(/\\/g, "/");

  if (!DRY_RUN && hashes[rel]?.hash === hash) {
    stats.skipped++;
    if (stats.total % 50 === 0) console.log(`  ...已扫描 ${stats.total}`);
    return;
  }

  let fm: Record<string, any> = {};
  let body = content;
  try { const p = matter(content); fm = p.data; body = p.content; } catch {}

  const title = fm.title || path.basename(filePath, ".md");

  // 找目录映射
  let remoteFolder = "";
  let visibility = "shared";
  let localRoot = "";
  for (const [ldir, rdir, vis] of DIR_MAP) {
    if (rel === ldir || rel.startsWith(ldir + "/")) {
      remoteFolder = `${BASE}${rdir}`;
      visibility = vis;
      localRoot = ldir;
      break;
    }
  }
  if (!remoteFolder) { stats.skipped++; return; }

  // 子目录
  const sub = path.dirname(rel).replace(/\\/g, "/");
  let targetFolder = remoteFolder;
  if (sub !== "." && sub !== localRoot) {
    const relSub = path.relative(localRoot, sub).replace(/\\/g, "/");
    targetFolder = `${remoteFolder}/${relSub}`;
  }

  const fid = await getOrCreateFolder(targetFolder, visibility);
  const tags = buildTags(fm, rel);
  const docBody = body.trim() || "(empty)";

  if (DRY_RUN) {
    if (stats.total < 10 || stats.total % 50 === 0) {
      console.log(`  [DRY] ${title} -> ${targetFolder}`);
    }
    stats.created++;
    hashes[rel] = { hash, imported_at: new Date().toISOString() };
    return;
  }

  // 检查是否已有同 path 文档（用 API internal path）
  const docPath = `${targetFolder}/${title.toLowerCase().replace(/ /g, "-").replace(/[^a-z0-9一-鿿\-]/g, "")}`;
  let existing: any = null;
  try { existing = await api("GET", `/api/documents/by-path?path=${encodeURIComponent(docPath)}`); } catch {}

  if (existing) {
    await api("PUT", `/api/documents/${existing.id}`, {
      title, content: docBody, tags, folder_id: fid,
    });
    stats.updated++;
  } else {
    await api("POST", "/api/documents", {
      title, content: docBody, tags, folder_id: fid, created_by: "kb-import",
    });
    stats.created++;
    if (stats.created % 20 === 0) console.log(`  ...已导入 ${stats.created}`);
  }
  hashes[rel] = { hash, imported_at: new Date().toISOString() };
}

async function walk(dir: string, hashes: Record<string, HashRecord>, stats: any) {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, hashes, stats);
    } else if (e.name.endsWith(".md")) {
      stats.total++;
      try { await importOne(full, hashes, stats); } catch (err: any) {
        stats.errors++;
        console.error(`\n  [ERR] ${path.relative(VAULT_PATH, full)}: ${err.message}`);
      }
    }
  }
}

async function main() {
  console.log("=== VMT 知识库导入 v2 ===\n");
  if (DRY_RUN) console.log("[DRY RUN]\n");

  const hashFile = "/home/ubuntu/metabot/scripts/kb-import/.import-hashes.json";
  let hashes: Record<string, HashRecord> = {};
  if (!RESET && fs.existsSync(hashFile)) {
    try { hashes = JSON.parse(fs.readFileSync(hashFile, "utf-8")); } catch {}
  }
  console.log(`${Object.keys(hashes).length} 条历史记录\n`);

  // 按序创建所有需要的文件夹（父→子）
  console.log("--- 文件夹 ---");
  // 收集所有需要的目标文件夹
  const neededFolders = new Set<string>();
  for (const [ldir, rdir, vis] of DIR_MAP) {
    neededFolders.add(`${BASE}${rdir}`);
    const fullDir = path.join(VAULT_PATH, ldir);
    if (!fs.existsSync(fullDir)) continue;
    // 扫描子目录
    function scanSubs(d: string, prefix: string) {
      let es: fs.Dirent[];
      try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of es) {
        if (e.name.startsWith(".")) continue;
        if (e.isDirectory()) {
          const subPath = `${prefix}/${e.name}`;
          neededFolders.add(subPath);
          scanSubs(path.join(d, e.name), subPath);
        }
      }
    }
    scanSubs(fullDir, `${BASE}${rdir}`);
  }

  // 按路径深度排序，确保父文件夹先创建
  const sorted = [...neededFolders].sort((a, b) => a.split("/").length - b.split("/").length);
  console.log(`${sorted.length} 个目标文件夹`);
  for (const fp of sorted) {
    const vis = fp.includes("/竞品库") || fp.includes("/客户库") || fp.includes("/卖法手册") || fp.includes("/方案文档")
      ? "private" : "shared";
    await getOrCreateFolder(fp, vis);
  }

  // 导入
  console.log("\n--- 导入 ---");
  const stats = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
  for (const [ldir] of DIR_MAP) {
    const d = path.join(VAULT_PATH, ldir);
    if (!fs.existsSync(d)) continue;
    await walk(d, hashes, stats);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(hashFile, JSON.stringify(hashes, null, 2));
  }

  console.log(`\n=== 完成 ===`);
  console.log(`  扫描:${stats.total} 新增:${stats.created} 更新:${stats.updated} 跳过:${stats.skipped} 错误:${stats.errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
