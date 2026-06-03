import type * as lark from '@larksuiteoapi/node-sdk';
import type { ContentBlock } from '../core/types.js';

const BLOCK_TYPE_HEADING_BASE = 3;

export class DocxApi {
  constructor(private client: lark.Client) {}

  async createDocument(title: string, folderToken?: string) {
    const data: Record<string, string> = { title };
    if (folderToken) data.folder_token = folderToken;

    const resp = await this.client.docx.v1.document.create({ data });
    if (resp.code !== 0) throw new Error(`Docx create failed: ${resp.code}: ${resp.msg}`);
    return resp.data!.document!;
  }

  async getDocument(documentId: string) {
    const resp = await this.client.docx.v1.document.get({
      path: { document_id: documentId },
    });
    if (resp.code !== 0) throw new Error(`Docx get failed: ${resp.msg}`);
    return resp.data!.document!;
  }

  async addBlocks(documentId: string, blockId: string, blocks: ContentBlock[]) {
    const children = blocks.map(toFeishuBlock);
    const resp = await this.client.docx.v1.documentBlockChildren.create({
      path: { document_id: documentId, block_id: blockId },
      data: { children: children as any },
    });
    if (resp.code !== 0) throw new Error(`Docx addBlocks failed: ${resp.msg}`);
    return resp.data!.children!;
  }

  async getBlocks(documentId: string, pageSize = 500) {
    const resp = await (this.client.docx.v1.documentBlock as any).listWithPage({
      path: { document_id: documentId },
      params: { page_size: pageSize },
    });
    if (resp.code !== 0) throw new Error(`Docx getBlocks failed: ${resp.msg}`);
    return resp.data!;
  }
}

function toFeishuBlock(block: ContentBlock): Record<string, unknown> {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(block.level || 1, 1), 9);
      const blockType = BLOCK_TYPE_HEADING_BASE + level - 1;
      return {
        block_type: blockType,
        [`heading${level}`]: {
          elements: [{ text_run: { content: block.content } }],
        },
      };
    }
    case 'text':
      return {
        block_type: 2,
        text: { elements: [{ text_run: { content: block.content } }] },
      };
    case 'bullet':
      return {
        block_type: 12,
        bullet: {
          elements: [{ text_run: { content: block.content } }],
        },
      };
    case 'ordered':
      return {
        block_type: 13,
        ordered: {
          elements: [{ text_run: { content: block.content } }],
        },
      };
    case 'code':
      return {
        block_type: 14,
        code: {
          language: block.language || 'PlainText',
          elements: [{ text_run: { content: block.content } }],
        },
      };
    default:
      return {
        block_type: 2,
        text: { elements: [{ text_run: { content: block.content } }] },
      };
  }
}
