import type * as lark from '@larksuiteoapi/node-sdk';
import type { IndexRecord } from '../core/types.js';

export class BitableApi {
  constructor(private client: lark.Client) {}

  async searchRecords(appToken: string, tableId: string, filter: Record<string, unknown>, fieldNames?: string[]) {
    const data: Record<string, unknown> = { filter };
    if (fieldNames) data.field_names = fieldNames;

    const resp = await this.client.bitable.v1.appTableRecord.search({
      path: { app_token: appToken, table_id: tableId },
      data: data as any,
    });
    if (resp.code !== 0) throw new Error(`Bitable search failed: ${resp.msg}`);
    return resp.data!.items || [];
  }

  async createRecord(appToken: string, tableId: string, fields: Record<string, unknown>) {
    const resp = await this.client.bitable.v1.appTableRecord.create({
      path: { app_token: appToken, table_id: tableId },
      data: { fields: fields as any },
    });
    if (resp.code !== 0) throw new Error(`Bitable createRecord failed: ${resp.msg}`);
    return resp.data!.record!;
  }

  async batchCreateRecords(appToken: string, tableId: string, records: Record<string, unknown>[]) {
    const resp = await this.client.bitable.v1.appTableRecord.batchCreate({
      path: { app_token: appToken, table_id: tableId },
      data: { records: records.map((fields) => ({ fields: fields as any })) },
    });
    if (resp.code !== 0) throw new Error(`Bitable batchCreate failed: ${resp.msg}`);
    return resp.data!.records || [];
  }

  async listRecords(appToken: string, tableId: string, pageSize = 500) {
    const resp = await (this.client.bitable.v1.appTableRecord as any).listWithPage({
      path: { app_token: appToken, table_id: tableId },
      params: { page_size: pageSize },
    });
    if (resp.code !== 0) throw new Error(`Bitable listRecords failed: ${resp.msg}`);
    return resp.data!;
  }

  toIndexRecord(fields: Record<string, unknown>): IndexRecord {
    return {
      标题: String(fields['标题'] || ''),
      分类: String(fields['分类'] || ''),
      子分类: String(fields['子分类'] || ''),
      文档类型: String(fields['文档类型'] || ''),
      节点Token: String(fields['节点Token'] || ''),
      对象Token: String(fields['对象Token'] || ''),
      标签: Array.isArray(fields['标签']) ? fields['标签'].map(String) : [],
      摘要: String(fields['摘要'] || ''),
      来源: String(fields['来源'] || ''),
    };
  }
}
