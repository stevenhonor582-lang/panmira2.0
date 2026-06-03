import 'dotenv/config';
import * as lark from '@larksuiteoapi/node-sdk';
import { DocxApi } from './api/docx.js';
import { BitableApi } from './api/bitable.js';
import { KnowledgeSearch } from './core/search.js';
import { KnowledgeArchive } from './core/archive.js';
import { routeMessage, type RouteResult } from './core/router.js';
import { buildSearchResultCard, buildArchiveConfirmCard, buildArchiveSuccessCard } from './cards/index.js';
import type { SearchResult, ArchiveRequest, CardActionValue } from './core/types.js';

export class KnowledgeBase {
  private search: KnowledgeSearch;
  private archive: KnowledgeArchive;

  constructor(client: lark.Client) {
    const docx = new DocxApi(client);
    const bitable = new BitableApi(client);
    this.search = new KnowledgeSearch(bitable);
    this.archive = new KnowledgeArchive(docx, bitable);
  }

  async handleMessage(text: string): Promise<{ card: Record<string, unknown>; route: RouteResult } | null> {
    const route = routeMessage(text);

    switch (route.target) {
      case 'knowledge_search': {
        const keyword = route.keyword || text;
        const results = await this.search.search(keyword, route.category);
        const card = buildSearchResultCard(keyword, results);
        return { card, route };
      }

      case 'knowledge_create':
        return null;

      case 'knowledge_archive':
      case 'business':
      case 'general':
        return null;
    }
  }

  async archiveDocument(req: ArchiveRequest) {
    const result = await this.archive.archive(req);
    return {
      ...result,
      card: buildArchiveSuccessCard(result.title, req.category, result.nodeToken!),
    };
  }

  async handleCardAction(value: CardActionValue): Promise<Record<string, unknown> | null> {
    switch (value.action) {
      case 'view_doc': {
        const objToken = String(value.obj_token || '');
        const objType = String(value.obj_type || 'docx');
        const title = String(value.title || '');

        return {
          schema: '2.0',
          header: { title: { tag: 'plain_text', content: `📄 ${title}` } },
          body: {
            elements: [
              { tag: 'markdown', content: `文档类型: ${objType}` },
              {
                tag: 'action',
                actions: [
                  {
                    tag: 'button',
                    text: { tag: 'plain_text', content: '在飞书中打开' },
                    type: 'primary',
                    url: `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${value.node_token || objToken}`,
                  },
                ],
              },
            ],
          },
        };
      }

      case 'archive':
        return null;

      case 'skip':
        return null;

      default:
        return null;
    }
  }

}

export { routeMessage, type RouteResult } from './core/router.js';
export type { SearchResult, ArchiveRequest, ContentBlock, CardActionValue } from './core/types.js';
export { buildSearchResultCard, buildArchiveConfirmCard, buildArchiveSuccessCard } from './cards/index.js';
