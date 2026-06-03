import type { SearchResult, ArchiveRequest, ContentBlock } from './types.js';

export type RouteTarget = 'knowledge_search' | 'knowledge_archive' | 'knowledge_create' | 'business' | 'general';

export interface RouteResult {
  target: RouteTarget;
  keyword?: string;
  category?: string;
  archiveRequest?: ArchiveRequest;
}

const SEARCH_KEYWORDS = ['查', '找', '搜索', '有没有', '查询', '搜索一下', '帮我找'];
const ARCHIVE_KEYWORDS = ['存', '归档', '保存到', '存到知识库', '入库'];
const CREATE_KEYWORDS = ['新建文档', '创建文档', '新建笔记', '新建记录', '写个文档'];
const BUSINESS_KEYWORDS = ['报价', '合同', '客户', '订单', '发票'];
const CATEGORIES = ['开发知识', '行业资料', '产品信息', '业务产出'];

export function routeMessage(text: string): RouteResult {
  const normalized = text.trim();

  if (containsAny(normalized, SEARCH_KEYWORDS)) {
    const keyword = extractKeyword(normalized, SEARCH_KEYWORDS);
    const category = extractCategory(normalized);
    return { target: 'knowledge_search', keyword, category };
  }

  if (containsAny(normalized, ARCHIVE_KEYWORDS)) {
    return { target: 'knowledge_archive' };
  }

  if (containsAny(normalized, CREATE_KEYWORDS)) {
    return { target: 'knowledge_create' };
  }

  if (containsAny(normalized, BUSINESS_KEYWORDS)) {
    return { target: 'business' };
  }

  return { target: 'general' };
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

function extractKeyword(text: string, keywords: string[]): string {
  for (const k of keywords) {
    const idx = text.indexOf(k);
    if (idx >= 0) {
      return text.slice(idx + k.length).trim();
    }
  }
  return text;
}

function extractCategory(text: string): string | undefined {
  for (const cat of CATEGORIES) {
    if (text.includes(cat)) return cat;
  }
  return undefined;
}
