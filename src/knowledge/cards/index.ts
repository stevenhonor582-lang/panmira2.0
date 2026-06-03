import type { SearchResult } from '../core/types.js';

export function buildSearchResultCard(keyword: string, results: SearchResult[]): Record<string, unknown> {
  if (results.length === 0) {
    return {
      schema: '2.0',
      header: {
        title: { tag: 'plain_text', content: `🔍 知识库搜索：${keyword}` },
        subtitle: { tag: 'plain_text', content: '未找到相关文档' },
      },
      body: {
        elements: [
          { tag: 'markdown', content: '没有匹配的文档。试试其他关键词？' },
        ],
      },
    };
  }

  const elements: Record<string, unknown>[] = [];

  for (let i = 0; i < Math.min(results.length, 5); i++) {
    const r = results[i];
    const typeIcon: Record<string, string> = {
      docx: '📄', sheet: '📊', bitable: '📋', mindnote: '🧠',
    };
    const icon = typeIcon[r.objType] || '📄';
    const tags = r.tags.length > 0 ? `\n标签: ${r.tags.join(', ')}` : '';

    elements.push({
      tag: 'column_set',
      columns: [
        {
          tag: 'column',
          elements: [
            { tag: 'markdown', content: `**${i + 1}. ${r.title}**` },
            { tag: 'plain_text', content: `${icon} ${r.category}${tags}` },
          ],
        },
        {
          tag: 'column',
          width: 'auto',
          vertical_align: 'center',
          elements: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '查看' },
              type: 'primary',
              size: 'small',
              value: {
                action: 'view_doc',
                obj_token: r.objToken,
                obj_type: r.objType,
                node_token: r.nodeToken,
                title: r.title,
              },
            },
          ],
        },
      ],
    });

    if (i < Math.min(results.length, 5) - 1) {
      elements.push({ tag: 'hr' });
    }
  }

  return {
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: `🔍 知识库搜索：${keyword}` },
      subtitle: { tag: 'plain_text', content: `找到 ${results.length} 条相关文档` },
    },
    body: { elements },
  };
}

export function buildArchiveConfirmCard(title: string, summary: string): Record<string, unknown> {
  return {
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: `📄 ${title}` },
    },
    body: {
      elements: [
        { tag: 'markdown', content: summary },
        { tag: 'hr' },
        { tag: 'markdown', content: '是否归档到知识库？' },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '✅ 归档到知识库' },
              type: 'primary',
              value: { action: 'archive', title },
            },
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '📂 选择目录' },
              type: 'default',
              value: { action: 'select_folder', title },
            },
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '跳过' },
              type: 'default',
              value: { action: 'skip' },
            },
          ],
        },
      ],
    },
  };
}

export function buildArchiveSuccessCard(title: string, category: string, nodeToken: string): Record<string, unknown> {
  return {
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: '✅ 文档已归档' },
    },
    body: {
      elements: [
        { tag: 'markdown', content: `**${title}**\n📂 知识库/${category}` },
        { tag: 'hr' },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '打开文档' },
              type: 'primary',
              value: { action: 'open_doc', node_token: nodeToken },
            },
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '编辑' },
              type: 'default',
              value: { action: 'edit_doc', node_token: nodeToken },
            },
          ],
        },
      ],
    },
  };
}
