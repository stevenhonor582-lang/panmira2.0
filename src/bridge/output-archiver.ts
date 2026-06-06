import * as fs from 'node:fs/promises';
import type { OutputFile } from './outputs-manager.js';
import type { MemoryClient } from '../memory/memory-client.js';
import type { Logger } from '../utils/logger.js';
import type { WorkspaceManager } from '../memory/workspace-manager.js';
import { FileExtractor } from './file-extractor.js';

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.xml',
  '.html', '.css', '.js', '.ts', '.py', '.sh', '.sql', '.toml',
]);

const MAX_CACHE_SIZE = 100;

export class OutputArchiver {
  private folderCache = new Map<string, string>();
  private extractor: FileExtractor;

  constructor(
    private memoryClient: MemoryClient,
    private logger: Logger,
  ) {
    this.extractor = new FileExtractor(logger);
  }

  async archiveFiles(botName: string, files: OutputFile[]): Promise<void> {
    if (files.length === 0) return;

    const parentFolderId = await this.ensureFolder('数字员工');
    if (!parentFolderId) return;

    const botRootId = await this.ensureFolder(botName, parentFolderId);
    if (!botRootId) return;

    const projectsId = await this.ensureFolder('项目', botRootId);
    if (!projectsId) return;

    const defaultProjectId = await this.ensureFolder('默认', projectsId);
    if (!defaultProjectId) return;

    const botFolderId = await this.ensureFolder('产出文件', defaultProjectId);
    if (!botFolderId) return;

    for (const file of files) {
      try {
        await this.archiveFile(file, botFolderId, botName);
      } catch (err) {
        this.logger.error?.('[OutputArchiver] archive ' + file.fileName + ' failed: ' + err);
      }
    }
  }

  async archiveFilesForGroup(
    groupId: string,
    botName: string,
    files: OutputFile[],
    workspaceManager: WorkspaceManager,
  ): Promise<void> {
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const result = await this.buildDocContent(file);
        if (result.content.length < 10) continue;

        await workspaceManager.createGroupDoc(groupId, '协作文档', file.fileName, result.content, [
          'bot-output',
          botName,
          'group-collab',
        ]);
      } catch (err) {
        this.logger.error?.('[OutputArchiver] group archive ' + file.fileName + ' failed: ' + err);
      }
    }
  }

  private async archiveFile(file: OutputFile, botFolderId: string, botName: string): Promise<void> {
    const result = await this.buildDocContent(file);
    if (result.content.length < 10) return;

    await this.memoryClient.createDocument({
      title: file.fileName,
      content: result.content,
      folder_id: botFolderId,
      tags: ['bot-output', botName],
      created_by: botName,
    });
  }

  private async buildDocContent(file: OutputFile): Promise<{ content: string }> {
    const ext = file.extension.toLowerCase();

    if (TEXT_EXTENSIONS.has(ext)) {
      const content = await fs.readFile(file.filePath, 'utf-8');
      return { content };
    }

    if (this.extractor.isSupported(ext)) {
      const result = await this.extractor.extract(file.filePath);
      const metaParts: string[] = [];
      if (result.metadata.format) metaParts.push('格式: ' + result.metadata.format);
      if (result.metadata.pages) metaParts.push('页数: ' + result.metadata.pages);
      if (result.metadata.sheets) metaParts.push('工作表: ' + result.metadata.sheets);

      const header = '[提取自 ' + ext + ' 文件: ' + file.fileName + ']';
      const meta = metaParts.length > 0 ? '\n' + metaParts.join(' | ') + '\n' : '';
      const content = header + meta + '\n' + result.text;
      return { content };
    }

    // Unsupported binary: minimal reference
    const content = '[二进制文件: ' + file.fileName + ']\n\n' +
      '类型: ' + ext + '\n' +
      '大小: ' + Math.round(file.sizeBytes / 1024) + 'KB\n' +
      '说明: 此文件格式暂不支持文本提取，请下载原始文件查看。';
    return { content };
  }

  private async ensureFolder(name: string, parentId = 'root'): Promise<string | null> {
    const cacheKey = parentId + '/' + name;
    const cached = this.folderCache.get(cacheKey);
    if (cached) return cached;

    const id = await this.memoryClient.ensureFolder(name, parentId);
    if (id) {
      if (this.folderCache.size >= MAX_CACHE_SIZE) {
        const oldest = this.folderCache.keys().next().value;
        if (oldest) this.folderCache.delete(oldest);
      }
      this.folderCache.set(cacheKey, id);
    }
    return id;
  }
}
