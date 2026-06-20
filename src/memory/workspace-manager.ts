import type { MemoryStorage, Folder, Document, DocumentSummary } from './memory-storage.js';
import type { Logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

interface DbFolderConfig {
  root: string;
  categories: Record<string, string>;
  projectSubCategories?: string[];
}

interface SkeletonConfig {
  dbFolders?: {
    org?: DbFolderConfig;
    bot?: DbFolderConfig;
    group?: DbFolderConfig;
  };
}

function loadDbFolders(): { org: DbFolderConfig; bot: DbFolderConfig; group: DbFolderConfig } {
  const skeletonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'workspace-skeleton.json');
  const raw = fs.readFileSync(skeletonPath, 'utf-8');
  const skeleton = JSON.parse(raw) as SkeletonConfig;
  const dbf = skeleton.dbFolders;
  if (!dbf?.org || !dbf?.bot || !dbf?.group) {
    throw new Error('workspace-skeleton.json missing dbFolders.org/bot/group');
  }
  return { org: dbf.org, bot: dbf.bot, group: dbf.group };
}

export interface Workspace {
  rootFolderId: string;
  rootPath: string;
  categories: Record<string, Folder>;
}

export class WorkspaceManager {
  private orgCache: Workspace | null = null;
  private botCache = new Map<string, Workspace>();
  private groupCache = new Map<string, Workspace>();
  private readonly cfg: { org: DbFolderConfig; bot: DbFolderConfig; group: DbFolderConfig };

  constructor(
    private storage: MemoryStorage,
    private logger: Logger,
  ) {
    this.cfg = loadDbFolders();
  }

  // ── Org Workspace ──

  async ensureOrgWorkspace(): Promise<Workspace> {
    if (this.orgCache) return this.orgCache;

    const { root: rootName, categories: catMap } = this.cfg.org;
    const root = await this.storage.createFolder(rootName, 'root', 'shared');
    const categories: Record<string, Folder> = {};
    for (const catName of Object.values(catMap)) {
      categories[catName] = await this.storage.createFolder(catName, root.id, 'shared');
    }

    this.orgCache = { rootFolderId: root.id, rootPath: root.path, categories };
    this.logger.info({ categories: Object.values(catMap) }, `${rootName}已初始化`);
    return this.orgCache;
  }

  async listOrgDocs(category?: string, limit = 50, offset = 0): Promise<DocumentSummary[]> {
    const org = await this.ensureOrgWorkspace();
    const folderId = category ? org.categories[category]?.id : org.rootFolderId;
    if (!folderId) return [];
    return this.storage.listDocuments(folderId, limit, offset);
  }

  async createOrgDoc(category: string, title: string, content: string, tags: string[] = []): Promise<Document> {
    const org = await this.ensureOrgWorkspace();
    const folder = org.categories[category];
    if (!folder) throw new Error(`Invalid org category: ${category}`);
    const doc = await this.storage.createDocument({ title, content, tags, folder_id: folder.id });
    return doc;
  }

  // ── Bot Workspace ──

  async ensureBotWorkspace(botName: string): Promise<Workspace> {
    const cached = this.botCache.get(botName);
    if (cached) return cached;

    // === RULE 0: botName 必须在 bot_configs 表中（白名单校验）===
    // 防止拼音别名/历史废弃名被用于创建孤儿 folder
    const { rows: validBot } = await pool.query(
      "SELECT bot_id, name, remark, display_name FROM bot_configs WHERE name = $1",
      [botName],
    );
    if (validBot.length === 0) {
      const errMsg = `Unknown bot: "${botName}" — not found in bot_configs. All bot workspaces must match a registered bot name.`;
      this.logger.error({ botName }, errMsg);
      throw new Error(errMsg);
    }

    const { root: empRoot, categories: catMap } = this.cfg.bot;
    const employeeRoot = await this.storage.createFolder(empRoot, 'root', 'shared');
    const botRoot = await this.storage.createFolder(botName, employeeRoot.id, 'shared');

    const categories: Record<string, Folder> = {};
    for (const catName of Object.values(catMap)) {
      categories[catName] = await this.storage.createFolder(catName, botRoot.id, 'shared');
    }

    const ws: Workspace = {
      rootFolderId: botRoot.id,
      rootPath: `${employeeRoot.path}/${botName}`,
      categories,
    };
    this.botCache.set(botName, ws);
    this.logger.info({ botName, categories: Object.keys(categories) }, '员工工作空间已初始化');
    return ws;
  }

  async deleteBotWorkspace(botName: string): Promise<void> {
    const ws = await this.findBotWorkspace(botName);
    if (!ws) return;
    await this.storage.deleteFolder(ws.rootFolderId);
    this.botCache.delete(botName);
    this.logger.info({ botName }, '员工工作空间已删除');
  }

  async listBotDocs(botName: string, category?: string, limit = 50, offset = 0): Promise<DocumentSummary[]> {
    const ws = await this.ensureBotWorkspace(botName);
    if (!category) {
      return this.storage.listDocuments(ws.rootFolderId, limit, offset);
    }
    const catName = this.cfg.bot.categories[category] || category;
    const folder = ws.categories[catName];
    if (!folder) throw new Error(`Invalid category: ${category} (mapped to ${catName})`);
    return this.storage.listDocuments(folder.id, limit, offset);
  }

  async createBotDoc(
    botName: string,
    category: string,
    title: string,
    content: string,
    tags: string[] = [],
  ): Promise<Document> {
    const ws = await this.ensureBotWorkspace(botName);
    const catName = this.cfg.bot.categories[category] || category;
    const folder = ws.categories[catName];
    if (!folder) throw new Error(`Invalid category: ${category} (mapped to ${catName})`);
    const doc = await this.storage.createDocument({ title, content, tags, folder_id: folder.id });
    return doc;
  }

  // ── Bot Project Subfolder ──

  async ensureBotProject(botName: string, projectName: string): Promise<Folder> {
    const ws = await this.ensureBotWorkspace(botName);
    const projectsFolder = ws.categories['项目'];
    if (!projectsFolder) throw new Error('项目 folder not found');
    const projectFolder = await this.storage.createFolder(projectName, projectsFolder.id, 'shared');
    return projectFolder;
  }

  async listBotProjects(botName: string): Promise<string[]> {
    const ws = await this.ensureBotWorkspace(botName);
    const projectsFolder = ws.categories['项目'];
    if (!projectsFolder) return [];
    const tree = await this.storage.getFolderTree('admin');
    const projNode = this.findInTreeDeep(tree, projectsFolder.id);
    if (!projNode) return [];
    return (projNode.children || []).map((c: any) => c.name);
  }

  async createBotProjectDoc(
    botName: string,
    projectName: string,
    title: string,
    content: string,
    tags: string[] = [],
  ): Promise<Document> {
    const projectFolder = await this.ensureBotProject(botName, projectName);
    const doc = await this.storage.createDocument({ title, content, tags, folder_id: projectFolder.id });
    return doc;
  }

  async listBotProjectDocs(botName: string, projectName: string, limit = 50, offset = 0): Promise<DocumentSummary[]> {
    const ws = await this.ensureBotWorkspace(botName);
    const projectsFolder = ws.categories['项目'];
    if (!projectsFolder) return [];
    const tree = await this.storage.getFolderTree('admin');
    const projNode = this.findInTreeDeep(tree, projectsFolder.id);
    if (!projNode) return [];
    const target = (projNode.children || []).find((c: any) => c.name === projectName);
    if (!target) return [];
    return this.storage.listDocuments(target.id, limit, offset);
  }

  // ── Group Workspace ──

  async ensureGroupWorkspace(groupId: string, groupName?: string): Promise<Workspace> {
    const cached = this.groupCache.get(groupId);
    if (cached) return cached;

    let resolvedName = groupName;
    if (!resolvedName) {
      try {
        const { rows } = await pool.query('SELECT group_name FROM coordinator_configs WHERE group_id = $1', [groupId]);
        if (rows[0]?.group_name) resolvedName = rows[0].group_name;
      } catch {
        /* table may not exist */
      }
    }
    if (!resolvedName) {
      try {
        const { rows } = await pool.query('SELECT chat_name FROM discovered_groups WHERE chat_id = $1', [groupId]);
        if (rows[0]?.chat_name) resolvedName = rows[0].chat_name;
      } catch {
        /* table may not exist */
      }
    }
    const idBasedName = groupId.replace(/^oc_/, '').slice(0, 20);
    const safeName = resolvedName || idBasedName;

    const { root: groupRootName, categories: catMap } = this.cfg.group;
    const groupRoot = await this.storage.createFolder(groupRootName, 'root', 'shared');
    let groupFolder = await this.storage.createFolder(safeName, groupRoot.id, 'shared');

    if (resolvedName && groupFolder.name === idBasedName) {
      const renamed = await this.storage.renameFolder(groupFolder.id, resolvedName);
      if (renamed) groupFolder = renamed;
    }

    const categories: Record<string, Folder> = {};
    for (const catName of Object.values(catMap)) {
      categories[catName] = await this.storage.createFolder(catName, groupFolder.id, 'shared');
    }

    const ws: Workspace = {
      rootFolderId: groupFolder.id,
      rootPath: `${groupRoot.path}/${groupFolder.name}`,
      categories,
    };
    this.groupCache.set(groupId, ws);
    this.logger.info({ groupId, groupName: groupFolder.name }, '群协作空间已初始化');
    return ws;
  }

  async deleteGroupWorkspace(groupId: string): Promise<void> {
    const ws = this.groupCache.get(groupId);
    if (!ws) return;
    await this.storage.deleteFolder(ws.rootFolderId);
    this.groupCache.delete(groupId);
  }

  async listGroupDocs(groupId: string, category?: string, limit = 50, offset = 0): Promise<DocumentSummary[]> {
    const ws = await this.ensureGroupWorkspace(groupId);
    if (!category) {
      return this.storage.listDocuments(ws.rootFolderId, limit, offset);
    }
    const catName = this.cfg.group.categories[category] || category;
    const folder = ws.categories[catName];
    if (!folder) throw new Error(`Invalid group category: ${category}`);
    return this.storage.listDocuments(folder.id, limit, offset);
  }

  async createGroupDoc(
    groupId: string,
    category: string,
    title: string,
    content: string,
    tags: string[] = [],
  ): Promise<Document> {
    const ws = await this.ensureGroupWorkspace(groupId);
    const catName = this.cfg.group.categories[category] || category;
    const folder = ws.categories[catName];
    if (!folder) throw new Error(`Invalid group category: ${category}`);
    const doc = await this.storage.createDocument({ title, content, tags, folder_id: folder.id });
    return doc;
  }

  // ── Document CRUD (shared) ──

  async updateDoc(
    docId: string,
    data: { title?: string; content?: string; tags?: string[] },
  ): Promise<Document | null> {
    const doc = await this.storage.updateDocument(docId, data);
    return doc;
  }

  async deleteDoc(docId: string): Promise<boolean> {
    const doc = await this.storage.getDocument(docId);
    const ok = await this.storage.deleteDocument(docId);
    return ok;
  }

  /** Rebuild the appropriate workspace index for a document, using its path to determine scope. */
  async rebuildIndexByDocPath(docId: string): Promise<void> {
    const doc = await this.storage.getDocument(docId);
    if (!doc?.path) return;
    const path = doc.path;
    if (path.includes('/索引/') || path.endsWith('/索引')) return;
    let scope: string;
    if (path.startsWith('/组织公共区/') || path === '/组织公共区') {
      scope = 'org';
    } else if (path.startsWith('/数字员工/')) {
      const botName = path.slice('/Root/数字员工/'.length).split('/')[0];
      scope = 'bot:' + botName;
    } else if (path.startsWith('/群协作区/')) {
      const groupId = path.slice('/Root/群协作区/'.length).split('/')[0];
      scope = 'group:' + groupId;
    } else {
      return;
    }
    try {
      const ws = await this.ensureWorkspaceByScope(scope);
      if (ws) await this.rebuildIndex(ws, scope);
    } catch (err: any) {
      this.logger.warn({ err: err.message, docId, scope }, 'rebuildIndexByDocPath failed');
    }
  }

  async ensureWorkspaceByScope(scope: string): Promise<Workspace | null> {
    if (scope === 'org') return this.ensureOrgWorkspace();
    if (scope.startsWith('bot:')) return this.ensureBotWorkspace(scope.slice(4));
    if (scope.startsWith('group:')) return this.ensureGroupWorkspace(scope.slice(6));
    return null;
  }

  async rebuildIndexForDoc(docId: string, folderId: string): Promise<void> {
    const org = this.orgCache;
    if (org && this.folderBelongsTo(org, folderId)) {
      await this.rebuildIndex(org, 'org');
      return;
    }
    for (const [, ws] of this.botCache) {
      if (this.folderBelongsTo(ws, folderId)) {
        await this.rebuildIndex(ws, `bot:${ws.rootPath.split('/').pop()}`);
        return;
      }
    }
    for (const [, ws] of this.groupCache) {
      if (this.folderBelongsTo(ws, folderId)) {
        await this.rebuildIndex(ws, `group:${ws.rootPath.split('/').pop()}`);
        return;
      }
    }
  }

  private folderBelongsTo(ws: Workspace, folderId: string): boolean {
    if (ws.rootFolderId === folderId) return true;
    for (const f of Object.values(ws.categories)) {
      if (f.id === folderId) return true;
    }
    return false;
  }

  // ── Folder ID helpers ──

  async resolveWorkspaceByFolderId(folderId: string): Promise<{ scope: string; categoryName: string }> {
    const org = await this.ensureOrgWorkspace();
    if (org.rootFolderId === folderId) return { scope: 'org', categoryName: '组织公共区' };
    for (const [catName, f] of Object.entries(org.categories)) {
      if (f.id === folderId) return { scope: 'org', categoryName: catName };
    }

    for (const [botName, ws] of this.botCache) {
      if (ws.rootFolderId === folderId) return { scope: `bot:${botName}`, categoryName: 'root' };
      for (const [catName, f] of Object.entries(ws.categories)) {
        if (f.id === folderId) return { scope: `bot:${botName}`, categoryName: catName };
      }
    }

    for (const [groupId, ws] of this.groupCache) {
      if (ws.rootFolderId === folderId) return { scope: `group:${groupId}`, categoryName: 'root' };
      for (const [catName, f] of Object.entries(ws.categories)) {
        if (f.id === folderId) return { scope: `group:${groupId}`, categoryName: catName };
      }
    }

    return { scope: 'unknown', categoryName: '' };
  }

  async getOrgFolderIds(): Promise<string[]> {
    const org = await this.ensureOrgWorkspace();
    return [org.rootFolderId, ...Object.values(org.categories).map((f) => f.id)];
  }

  async getBotFolderIds(botName: string): Promise<string[]> {
    const ws = await this.ensureBotWorkspace(botName);
    return [ws.rootFolderId, ...Object.values(ws.categories).map((f) => f.id)];
  }

  async getGroupFolderIds(groupId: string): Promise<string[]> {
    const ws = await this.ensureGroupWorkspace(groupId);
    return [ws.rootFolderId, ...Object.values(ws.categories).map((f) => f.id)];
  }

  async getBotOutputFolderId(botName: string, projectName?: string): Promise<string> {
    if (projectName) {
      const projectFolder = await this.ensureBotProject(botName, projectName);
      return projectFolder.id;
    }
    const ws = await this.ensureBotWorkspace(botName);
    const folder = ws.categories['知识沉淀'];
    if (!folder) throw new Error('知识沉淀 folder not found (fallback for output)');
    return folder.id;
  }

  async getBotKnowledgeFolderId(botName: string): Promise<string> {
    const ws = await this.ensureBotWorkspace(botName);
    const folder = ws.categories['知识沉淀'];
    if (!folder) throw new Error('知识沉淀 folder not found');
    return folder.id;
  }

  // ── Index System ──

  async getIndex(scope: string): Promise<Document | null> {
    const ws = await this.resolveWorkspace(scope);
    if (!ws) return null;
    const indexFolder = ws.categories['索引'];
    if (!indexFolder) return null;
    const docs = await this.storage.listDocuments(indexFolder.id, 1, 0);
    if (docs.length > 0) {
      return this.storage.getDocument(docs[0].id);
    }
    return null;
  }

  async rebuildIndex(ws: Workspace, scope: string): Promise<void> {
    const indexFolder = ws.categories['索引'];
    if (!indexFolder) return;

    const lines: string[] = [
      `# ${scope.startsWith('org') ? '组织公共区' : scope.startsWith('bot:') ? scope.slice(4) : scope.startsWith('group:') ? scope.slice(6) : scope} 索引\n`,
    ];

    const tree = await this.storage.getFolderTree('admin');
    for (const [catName, folder] of Object.entries(ws.categories)) {
      if (catName === '索引') continue;
      const docs = await this.storage.listDocuments(folder.id, 100, 0);

      const catNode = this.findInTreeDeep(tree, folder.id);
      const subDocs: DocumentSummary[] = [];
      if (catNode) {
        for (const child of catNode.children || []) {
          const childDocs = await this.storage.listDocuments(child.id, 100, 0);
          subDocs.push(...childDocs);
        }
      }

      const allDocs = [...docs, ...subDocs];
      if (allDocs.length === 0) continue;

      lines.push(`## ${catName}\n`);
      for (const doc of allDocs) {
        lines.push(`- [[${doc.title}]] (${doc.path}) ${doc.tags.length ? '`' + doc.tags.join('`, `') + '`' : ''}`);
      }
      lines.push('');
    }

    const indexContent = lines.join('\n');
    const existingDocs = await this.storage.listDocuments(indexFolder.id, 1, 0);

    if (existingDocs.length > 0) {
      await this.storage.updateDocument(existingDocs[0].id, { content: indexContent, skipAutoTag: true });
    } else {
      await this.storage.createDocument({
        title: '_索引',
        content: indexContent,
        tags: ['_index', 'auto-generated'],
        folder_id: indexFolder.id,
      });
    }
  }

  async resolveLinks(content: string, _maxDepth = 1): Promise<string> {
    const linkPattern = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;
    const resolved = new Map<string, string>();

    while ((match = linkPattern.exec(content)) !== null) {
      const title = match[1];
      if (resolved.has(title)) continue;

      try {
        const results = await this.storage.searchDocuments(title, 5, 'admin');
        const target = results.find((r) => r.title === title && !(r.tags || []).includes('_index'));
        if (target) {
          const doc = await this.storage.getDocument(target.id);
          if (doc) resolved.set(title, `---\n### ${doc.title}\n${doc.content.slice(0, 500)}\n`);
        }
      } catch {
        // skip unresolvable links
      }
    }

    if (resolved.size === 0) return content;
    const appendix = ['\n\n---\n# 引用内容\n'];
    for (const [, text] of resolved) {
      appendix.push(text);
    }
    return content + appendix.join('\n');
  }

  // ── Accessors ──

  getOrgCategoryNames(): string[] {
    return [...Object.values(this.cfg.org.categories)];
  }

  getBotCategoryMap(): Record<string, string> {
    return { ...this.cfg.bot.categories };
  }

  getGroupCategoryMap(): Record<string, string> {
    return { ...this.cfg.group.categories };
  }

  // ── Private ──

  private async findBotWorkspace(botName: string): Promise<Workspace | null> {
    const cached = this.botCache.get(botName);
    if (cached) return cached;
    return null;
  }

  private async resolveWorkspace(scope: string): Promise<Workspace | null> {
    if (scope === 'org') return this.ensureOrgWorkspace();
    if (scope.startsWith('bot:')) return this.ensureBotWorkspace(scope.slice(4));
    if (scope.startsWith('group:')) return this.ensureGroupWorkspace(scope.slice(6));
    return null;
  }

  private findInTree(node: any, name: string): any {
    for (const child of node.children || []) {
      if (child.name === name) return child;
    }
    return null;
  }

  private findInTreeDeep(node: any, targetId: string): any {
    if (node.id === targetId) return node;
    for (const child of node.children || []) {
      const found = this.findInTreeDeep(child, targetId);
      if (found) return found;
    }
    return null;
  }

  private treeNodeToFolder(node: any, parentId: string): Folder {
    return {
      id: node.id,
      name: node.name,
      parent_id: parentId,
      path: node.path,
      visibility: node.visibility || 'shared',
      created_at: '',
      updated_at: '',
    };
  }
}
