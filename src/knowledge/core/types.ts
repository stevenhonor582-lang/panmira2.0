export interface IndexRecord {
  标题: string;
  分类: string;
  子分类: string;
  文档类型: string;
  节点Token: string;
  对象Token: string;
  标签: string[];
  摘要: string;
  来源: string;
}

export interface SearchResult {
  title: string;
  category: string;
  objToken: string;
  objType: string;
  nodeToken: string;
  tags: string[];
  summary: string;
}

export interface ArchiveRequest {
  title: string;
  category: string;
  subCategory: string;
  content: ContentBlock[];
  tags: string[];
  source: '手动创建' | 'AI生成' | '业务归档' | '导入';
}

export interface ContentBlock {
  type: 'heading' | 'text' | 'bullet' | 'ordered' | 'code' | 'table';
  level?: number;
  content: string;
  items?: string[];
  language?: string;
  rows?: string[][];
}

export interface CardActionValue {
  action: string;
  [key: string]: unknown;
}
