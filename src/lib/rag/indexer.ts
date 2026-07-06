import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import {
  listMarkdownFiles,
  readEntryByPath,
} from "@/lib/journal/store";
import { chunkEntry } from "./chunk";
import { embedTexts } from "./embed";
import {
  deleteEntryChunks,
  dropIndex,
  getIndexedEntries,
  upsertEntryChunks,
} from "./store";

function entryIdForPath(filePath: string): string {
  return path.basename(filePath, ".md");
}

export async function indexFile(filePath: string): Promise<void> {
  const entry = readEntryByPath(filePath);
  if (!entry) return;
  const chunks = chunkEntry(entry);
  if (chunks.length === 0) {
    await deleteEntryChunks(entry.id);
    return;
  }
  const vectors = await embedTexts(chunks.map((c) => c.text));
  const mtimeMs = fs.statSync(filePath).mtimeMs;
  await upsertEntryChunks(entry.id, chunks, vectors, mtimeMs);
}

export async function removeFileFromIndex(filePath: string): Promise<void> {
  await deleteEntryChunks(entryIdForPath(filePath));
}

/**
 * Bring the index in line with the journal folder: index new/stale files,
 * prune entries whose files no longer exist.
 */
export async function syncIndex(): Promise<void> {
  const files = listMarkdownFiles(getConfig().journalDir);
  const indexed = await getIndexedEntries();
  const onDisk = new Set<string>();

  for (const filePath of files) {
    const entryId = entryIdForPath(filePath);
    onDisk.add(entryId);
    const indexedMtime = indexed.get(entryId);
    const mtimeMs = fs.statSync(filePath).mtimeMs;
    if (indexedMtime === undefined || mtimeMs > indexedMtime) {
      await indexFile(filePath);
    }
  }

  for (const entryId of indexed.keys()) {
    if (!onDisk.has(entryId)) {
      await deleteEntryChunks(entryId);
    }
  }
}

/** Drop the index and rebuild it from every markdown file. Returns file count. */
export async function rebuildIndex(): Promise<number> {
  await dropIndex();
  const files = listMarkdownFiles(getConfig().journalDir);
  for (const filePath of files) {
    await indexFile(filePath);
  }
  return files.length;
}
