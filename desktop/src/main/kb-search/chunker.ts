export interface Chunk {
  position: number;
  text: string;
}

/**
 * Split text into overlapping chunks of approximately `windowSize` characters.
 * Tries to break on paragraph boundaries (\n\n) when possible.
 */
export function chunkText(
  text: string,
  windowSize = 512 * 4, // ~512 tokens worth of chars (Chinese avg 1.5 char/token)
  overlap = 50 * 4,
): Chunk[] {
  if (!text.trim()) return [];

  const chunks: Chunk[] = [];
  let position = 0;

  // Helper: split a single long string into ~windowSize char windows with overlap.
  // Tries to break on whitespace near windowSize if available.
  const splitSegment = (segment: string): string[] => {
    if (segment.length <= windowSize) return [segment];

    const parts: string[] = [];
    let start = 0;
    while (start < segment.length) {
      let end = Math.min(start + windowSize, segment.length);

      // Try to break on a whitespace char (space, newline) just before end
      if (end < segment.length) {
        const slice = segment.slice(start, end);
        const lastWs = slice.search(/\s\S*$/);
        if (lastWs > windowSize * 0.5) {
          end = start + lastWs;
        }
      }

      parts.push(segment.slice(start, end));

      if (end >= segment.length) break;
      // Advance with overlap
      start = Math.max(end - overlap, end === start + windowSize ? start + 1 : 0);
      if (start <= 0 || start === end) start = end;
    }
    return parts;
  };

  // First, split by paragraphs (blank-line or single-newline)
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const para of paragraphs) {
    const parts = splitSegment(para);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        chunks.push({ position: position++, text: trimmed });
      }
    }
  }

  return chunks;
}
