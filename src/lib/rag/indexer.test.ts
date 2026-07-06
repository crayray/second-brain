import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEntry, deleteEntry } from "@/lib/journal/store";
import { dropIndex, getIndexedEntries, searchChunks } from "./store";
import { indexFile, rebuildIndex, removeFileFromIndex, syncIndex } from "./indexer";

// Deterministic fake embeddings: vector reflects which keyword the text contains.
vi.mock("./embed", () => ({
  embedTexts: vi.fn(async (texts: string[]) =>
    texts.map((text) => [
      text.includes("cats") ? 1 : 0,
      text.includes("dogs") ? 1 : 0,
      1,
    ])
  ),
}));

let journalDir: string;
let dataDir: string;

beforeEach(() => {
  journalDir = fs.mkdtempSync(path.join(os.tmpdir(), "journal-idx-"));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "data-idx-"));
  process.env.JOURNAL_DIR = journalDir;
  process.env.DATA_DIR = dataDir;
});

afterEach(async () => {
  await dropIndex();
  fs.rmSync(journalDir, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.JOURNAL_DIR;
  delete process.env.DATA_DIR;
});

describe("indexer", () => {
  it("indexes a file so it becomes searchable", async () => {
    const entry = createEntry({
      content: "thinking about cats today",
      tags: [],
      date: new Date("2026-07-01T09:00:00"),
    });
    await indexFile(entry.path);

    const results = await searchChunks([1, 0, 1], 1);
    expect(results).toHaveLength(1);
    expect(results[0].entryId).toBe(entry.id);
  });

  it("removes a deleted file from the index", async () => {
    const entry = createEntry({
      content: "thinking about dogs",
      tags: [],
      date: new Date("2026-07-01T09:00:00"),
    });
    await indexFile(entry.path);
    await removeFileFromIndex(entry.path);
    expect(await searchChunks([0, 1, 1], 5)).toHaveLength(0);
  });

  it("syncIndex indexes new files and prunes deleted ones", async () => {
    const kept = createEntry({
      content: "cats forever",
      tags: [],
      date: new Date("2026-07-01T09:00:00"),
    });
    const removed = createEntry({
      content: "dogs forever",
      tags: [],
      date: new Date("2026-07-02T09:00:00"),
    });
    await syncIndex();
    expect((await getIndexedEntries()).size).toBe(2);

    deleteEntry(removed.id);
    await syncIndex();
    const indexed = await getIndexedEntries();
    expect(indexed.size).toBe(1);
    expect(indexed.has(kept.id)).toBe(true);
  });

  it("rebuildIndex recreates everything from markdown", async () => {
    createEntry({
      content: "cats one",
      tags: [],
      date: new Date("2026-07-01T09:00:00"),
    });
    createEntry({
      content: "cats two",
      tags: [],
      date: new Date("2026-07-02T09:00:00"),
    });
    await syncIndex();
    await dropIndex();
    expect(await searchChunks([1, 0, 1], 5)).toHaveLength(0);

    const count = await rebuildIndex();
    expect(count).toBe(2);
    expect((await getIndexedEntries()).size).toBe(2);
  });
});
