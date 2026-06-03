import { DocxApi } from '../api/docx.js';
import { BitableApi } from '../api/bitable.js';
import { KB_CONFIG } from './config.js';
import type { ArchiveRequest } from './types.js';

export class KnowledgeArchive {
  private docx: DocxApi;
  private bitable: BitableApi;

  constructor(docx: DocxApi, bitable: BitableApi) {
    this.docx = docx;
    this.bitable = bitable;
  }

  async archive(req: ArchiveRequest) {
    const doc = await this.docx.createDocument(req.title);

    if (req.content.length > 0) {
      await this.docx.addBlocks(doc.document_id!, doc.document_id!, req.content);
    }

    const summary = req.content
      .filter((b) => b.type === 'text' || b.type === 'heading')
      .map((b) => b.content)
      .slice(0, 3)
      .join(' ')
      .slice(0, 200);

    await this.bitable.createRecord(KB_CONFIG.INDEX_APP_TOKEN, KB_CONFIG.INDEX_TABLE_ID, {
      '标题': req.title,
      '分类': req.category,
      '子分类': req.subCategory,
      '文档类型': 'docx',
      '节点Token': '',
      '对象Token': doc.document_id!,
      '标签': req.tags,
      '摘要': summary,
      '来源': req.source,
    });

    return {
      documentId: doc.document_id,
      nodeToken: '',
      objToken: doc.document_id,
      title: req.title,
    };
  }

  async archiveExisting(objToken: string, objType: string, category: string, title: string) {
    await this.bitable.createRecord(KB_CONFIG.INDEX_APP_TOKEN, KB_CONFIG.INDEX_TABLE_ID, {
      '标题': title,
      '分类': category,
      '子分类': '',
      '文档类型': objType,
      '节点Token': '',
      '对象Token': objToken,
      '标签': [],
      '摘要': '',
      '来源': '业务归档',
    });

    return { nodeToken: '', objToken };
  }
}
