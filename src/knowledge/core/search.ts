import { BitableApi } from '../api/bitable.js';
import { KB_CONFIG } from './config.js';
import type { SearchResult } from './types.js';

export class KnowledgeSearch {
  private bitable: BitableApi;

  constructor(bitable: BitableApi) {
    this.bitable = bitable;
  }

  async search(keyword: string, category?: string): Promise<SearchResult[]> {
    const conditions: Record<string, unknown>[] = [];

    const titleCondition = {
      field_name: '标题',
      operator: 'contains',
      value: [keyword],
    };
    const tagCondition = {
      field_name: '标签',
      operator: 'contains',
      value: [keyword],
    };
    const summaryCondition = {
      field_name: '摘要',
      operator: 'contains',
      value: [keyword],
    };

    if (category) {
      conditions.push({
        field_name: '分类',
        operator: 'is',
        value: [category],
      });
      conditions.push({
        conjunction: 'or',
        conditions: [titleCondition, tagCondition, summaryCondition],
      });
      const filter = { conjunction: 'and', conditions };
      return this.executeSearch(filter);
    }

    const filter = {
      conjunction: 'or',
      conditions: [titleCondition, tagCondition, summaryCondition],
    };
    return this.executeSearch(filter);
  }

  async listByCategory(category: string): Promise<SearchResult[]> {
    const filter = {
      conjunction: 'and',
      conditions: [
        { field_name: '分类', operator: 'is', value: [category] },
      ],
    };
    return this.executeSearch(filter);
  }

  private async executeSearch(filter: Record<string, unknown>): Promise<SearchResult[]> {
    const records = await this.bitable.searchRecords(
      KB_CONFIG.INDEX_APP_TOKEN,
      KB_CONFIG.INDEX_TABLE_ID,
      filter,
      ['标题', '分类', '文档类型', '节点Token', '对象Token', '标签', '摘要'],
    );

    return records.map((r: any) => {
      const f = r.fields || {};
      const rec = this.bitable.toIndexRecord(f);
      return {
        title: rec.标题,
        category: rec.分类,
        objToken: rec.对象Token,
        objType: rec.文档类型,
        nodeToken: rec.节点Token,
        tags: rec.标签,
        summary: rec.摘要,
      };
    });
  }
}
