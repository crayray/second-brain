export interface Chunk {
  /** `${entryId}#${chunkIndex}` — stable id for upserts. */
  id: string;
  entryId: string;
  path: string;
  date: string;
  chunkIndex: number;
  text: string;
}

export interface ChunkableEntry {
  id: string;
  path: string;
  date: string;
  content: string;
}

// ~800 tokens at ~4 chars/token. Journal entries are usually one chunk.
const MAX_CHUNK_CHARS = 3200;

function splitParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHUNK_CHARS) return [paragraph];
  // Rare fallback for a single huge paragraph: split on word boundaries.
  const words = paragraph.split(/\s+/);
  const parts: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const word of words) {
    if (length + word.length + 1 > MAX_CHUNK_CHARS && current.length > 0) {
      parts.push(current.join(" "));
      current = [];
      length = 0;
    }
    current.push(word);
    length += word.length + 1;
  }
  if (current.length > 0) parts.push(current.join(" "));
  return parts;
}

export function chunkEntry(entry: ChunkableEntry): Chunk[] {
  const content = entry.content.trim();
  if (content === "") return [];

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap(splitParagraph);

  const texts: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (length + paragraph.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
      texts.push(current.join("\n\n"));
      current = [];
      length = 0;
    }
    current.push(paragraph);
    length += paragraph.length + 2;
  }
  if (current.length > 0) texts.push(current.join("\n\n"));

  return texts.map((text, chunkIndex) => ({
    id: `${entry.id}#${chunkIndex}`,
    entryId: entry.id,
    path: entry.path,
    date: entry.date,
    chunkIndex,
    text,
  }));
}
