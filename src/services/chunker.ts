/**
 * Plan B-2 文档分块工具
 * 简单实现:按 paragraph (\n\n+) 切,再按 chunkSize 字符数限制合并
 */
export interface ChunkOptions {
  chunkSize: number;     // 默认 512 字符
  chunkOverlap: number;  // 默认 64 字符
}

export interface Chunk {
  index: number;
  content: string;
  heading?: string;
  tokenCount: number;  // 粗略按字符数 / 4 估算
}

export function chunkText(text: string, opts: ChunkOptions): Chunk[] {
  const chunkSize = opts.chunkSize || 512;
  const chunkOverlap = opts.chunkOverlap || 64;
  if (!text || !text.trim()) return [];

  // 1. 按段落切
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [];

  // 2. 合并段落,直到接近 chunkSize
  const chunks: Chunk[] = [];
  let buffer = '';
  let index = 0;

  for (const p of paragraphs) {
    if (!buffer) {
      buffer = p;
      continue;
    }
    // 加上下一个段落会超 chunkSize?
    if (buffer.length + 2 + p.length <= chunkSize) {
      buffer += '\n\n' + p;
    } else {
      // flush buffer
      chunks.push(makeChunk(index++, buffer, chunkOverlap));
      buffer = p;
    }
  }
  if (buffer) chunks.push(makeChunk(index++, buffer, chunkOverlap));

  return chunks;
}

function makeChunk(index: number, content: string, overlap: number): Chunk {
  // 简单 heading 提取:取第一行作为 heading
  const firstLine = content.split('\n')[0]?.trim() || '';
  const heading = firstLine.length > 0 && firstLine.length <= 200 ? firstLine : undefined;
  return {
    index,
    content,
    heading,
    tokenCount: Math.ceil(content.length / 4),  // 粗略估算
  };
}

export function makeChunkId(documentId: string, chunkIndex: number): string {
  return `${documentId}::chunk::${chunkIndex}`;
}
