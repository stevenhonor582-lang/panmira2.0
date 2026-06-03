import type { MemoryStorage, Folder, Document, DocumentSummary } from './memory-storage.js';
import type { Logger } from '../utils/logger.js';
import { pool } from '../db/index.js';

const ORG_ROOT = '组织公共区';
const ORG_CATEGORIES = ['00-导航', 'R0-品牌规范', 'R1-竞品库', 'R2-客户库', 'R3-卖法手册', 'R4-技术库', 'R5-产品库'];

const EMPLOYEE_ROOT = '数字员工';
const EMPLOYEE_CATEGORIES = ['知识沉淀', '工作库', '专业文档', '技能库', '项目', '索引'];
const WORK_SUB_CATEGORIES: Record<string, string[]> = {
  工作库: ['上传文件', '产出文件'],
};

const GROUP_ROOT = '群协作区';
const GROUP_CATEGORIES = ['项目文件', '协作文档', '知识沉淀', '索引'];

export interface Workspace {
  rootFolderId: string;
  rootPath: string;
  categories: Record<string, Folder>;
}

const BOT_CATEGORY_MAP: Record<string, string> = {
  knowledge: '知识沉淀',
  uploads: '上传文件',
  outputs: '产出文件',
  professional: '专业文档',
  skills: '技能库',
  projects: '项目',
  index: '索引',
};

const ORG_CATEGORY_MAP: Record<string, string> = {
  navigation: '00-导航',
  brand: 'R0-品牌规范',
  competitors: 'R1-竞品库',
  customers: 'R2-客户库',
  salesPlaybook: 'R3-卖法手册',
  tech: 'R4-技术库',
  products: 'R5-产品库',
  index: '索引',
};

const GROUP_CATEGORY_MAP: Record<string, string> = {
  projectFiles: '项目文件',
  collabDocs: '协作文档',
  knowledge: '知识沉淀',
  index: '索引',
};

export class WorkspaceManager {
  private orgCache: Workspace | null = null;
  private botCache = new Map<string, Workspace>();
  private groupCache = new Map<string, Workspace>();

  constructor(
    private storage: MemoryStorage,
    private logger: Logger,
  ) {}

  // ── Org Workspace ──

  async ensureOrgWorkspace(): Promise<Workspace> {
    if (this.orgCache) return this.orgCache;

    const root = await this.storage.createFolder(ORG_ROOT, 'root', 'shared');
    const categories: Record<string, Folder> = {};
    for (const name of ORG_CATEGORIES) {
      categories[name] = await this.storage.createFolder(name, root.id, 'shared');
    }
    categories['索引'] = await this.storage.createFolder('索引', root.id, 'shared');

    this.orgCache = { rootFolderId: root.id, rootPath: root.path, categories };
    this.logger.info({ categories: [...ORG_CATEGORIES, '索引'] }, '组织公共区已初始化');
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

    const employeeRoot = await this.storage.createFolder(EMPLOYEE_ROOT, 'root', 'shared');
    const botRoot = await this.storage.createFolder(botName, employeeRoot.id, 'shared');

    const categories: Record<string, Folder> = {};
    for (const cat of EMPLOYEE_CATEGORIES) {
      const catFolder = await this.storage.createFolder(cat, botRoot.id, 'shared');
      categories[cat] = catFolder;

      const subCats = WORK_SUB_CATEGORIES[cat];
      if (subCats) {
        for (const sub of subCats) {
          categories[sub] = await this.storage.createFolder(sub, catFolder.id, 'shared');
        }
      }
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
    const catName = BOT_CATEGORY_MAP[category] || category;
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
    const catName = BOT_CATEGORY_MAP[category] || category;
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
    await this.storage.createFolder('索引', projectFolder.id, 'shared');
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
    // Priority 1: coordinator_configs (user-configured group name in metabot settings)
    if (!resolvedName) {
      try {
        const { rows } = await pool.query('SELECT group_name FROM coordinator_configs WHERE group_id = $1', [groupId]);
        if (rows[0]?.group_name) resolvedName = rows[0].group_name;
      } catch {
        /* table may not exist */
      }
    }
    // Priority 2: discovered_groups.chat_name
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
    const groupRoot = await this.storage.createFolder(GROUP_ROOT, 'root', 'shared');
    let groupFolder = await this.storage.createFolder(safeName, groupRoot.id, 'shared');

    if (resolvedName && groupFolder.name === idBasedName) {
      const renamed = await this.storage.renameFolder(groupFolder.id, resolvedName);
      if (renamed) groupFolder = renamed;
    }

    const categories: Record<string, Folder> = {};
    for (const cat of GROUP_CATEGORIES) {
      categories[cat] = await this.storage.createFolder(cat, groupFolder.id, 'shared');
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
    const catName = GROUP_CATEGORY_MAP[category] || category;
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
    const catName = GROUP_CATEGORY_MAP[category] || category;
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

  /** Rebuild the appropriate workspace index for a document, using its path to determine scope.
   *  (folderBelongsTo only checks direct categories, not subfolders like 工作库/产出文件/) */
  async rebuildIndexByDocPath(docId: string): Promise<void> {
    const doc = await this.storage.getDocument(docId);
    if (!doc?.path) return;
    const path = doc.path;
    if (path.includes('/索引/') || path.endsWith('/索引')) return;
    let scope: string;
    if (path.startsWith('/Root/组织公共区/') || path === '/Root/组织公共区') {
      scope = 'org';
    } else if (path.startsWith('/Root/数字员工/')) {
      const botName = path.slice('/Root/数字员工/'.length).split('/')[0];
      scope = 'bot:' + botName;
    } else if (path.startsWith('/Root/群协作区/')) {
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
    // Check cached workspaces first
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
    // Fallback: ensure workspace by iterating all known scopes
    // (handles documents belonging to workspaces not yet cached)
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

  async getBotOutputFolderId(botName: string): Promise<string> {
    const ws = await this.ensureBotWorkspace(botName);
    const folder = ws.categories['产出文件'];
    if (!folder) throw new Error('产出文件 folder not found');
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

      // Also include docs from subfolders (e.g. 项目/外贸报价)
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
    return [...ORG_CATEGORIES];
  }

  getBotCategoryMap(): Record<string, string> {
    return { ...BOT_CATEGORY_MAP };
  }

  getGroupCategoryMap(): Record<string, string> {
    return { ...GROUP_CATEGORY_MAP };
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
