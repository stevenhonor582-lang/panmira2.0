export interface Chunk {
  index: number;
  content: string;
  heading?: string;
}

const MIN_CHUNK_SIZE = 100;
const SLIDING_WINDOW_SIZE = 500;
const SLIDING_WINDOW_OVERLAP = 100;

export function chunkDocument(title: string, content: string): Chunk[] {
  const fullText = content.trim();
  if (fullText.length < MIN_CHUNK_SIZE) {
    return [{ index: 0, content: `${title}\n${fullText}` }];
  }

  const headingChunks = splitByHeadings(title, fullText);
  if (headingChunks.length > 1) return headingChunks;

  return splitBySlidingWindow(title, fullText);
}

function splitByHeadings(title: string, text: string): Chunk[] {
  const lines = text.split('\n');
  const sections: { heading: string; lines: string[] }[] = [];
  let current = { heading: title, lines: [] as string[] };

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)/);
    if (match) {
      if (current.lines.length > 0) {
        sections.push(current);
      }
      current = { heading: `${title} > ${match[2].trim()}`, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) {
    sections.push(current);
  }

  if (sections.length <= 1) return [];

  return sections
    .map((s, i) => ({
      index: i,
      content: s.lines.join('\n').trim(),
      heading: s.heading,
    }))
    .filter((c) => c.content.length > 0);
}

function splitBySlidingWindow(title: string, text: string): Chunk[] {
  const chunks: Chunk[] = [];
  let pos = 0;
  let idx = 0;

  while (pos < text.length) {
    const end = Math.min(pos + SLIDING_WINDOW_SIZE, text.length);
    let segment = text.slice(pos, end);

    if (end < text.length) {
      const lastPeriod = segment.search(/[。！？.!?\n][^。！？.!?\n]*$/);
      if (lastPeriod > SLIDING_WINDOW_SIZE * 0.3) {
        segment = segment.slice(0, lastPeriod + 1);
      }
    }

    chunks.push({
      index: idx,
      content: idx === 0 ? `${title}\n${segment.trim()}` : segment.trim(),
      heading: idx === 0 ? title : undefined,
    });

    pos += segment.length - SLIDING_WINDOW_OVERLAP;
    if (pos <= idx * (SLIDING_WINDOW_SIZE - SLIDING_WINDOW_OVERLAP)) {
      pos = idx * (SLIDING_WINDOW_SIZE - SLIDING_WINDOW_OVERLAP) + SLIDING_WINDOW_SIZE - SLIDING_WINDOW_OVERLAP;
    }
    idx++;
  }

  return chunks;
}
