import { embedText } from "./embed";
import { searchChunks, type SearchResult } from "./store";

const DEFAULT_K = 6;

export async function retrieve(
  query: string,
  k: number = DEFAULT_K,
  dateRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const vector = await embedText(query);
  return searchChunks(vector, k, dateRange);
}
