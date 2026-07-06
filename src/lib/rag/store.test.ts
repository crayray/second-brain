import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteEntryChunks,
  dropIndex,
  getIndexedEntries,
  searchChunks,
  upsertEntryChunks,
} from "./store";
import type { Chunk } from "./chunk";

let tmpDir: string;

function chunk(entryId: string, text: string, chunkIndex = 0): Chunk {
  return {
    id: `${entryId}#${chunkIndex}`,
    entryId,
    path: `/journal/${entryId}.md`,
    date: `${entryId.slice(0, 10)}T09:00:00.000Z`,
    chunkIndex,
    text,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lancedb-test-"));
  process.env.DATA_DIR = tmpDir;
});

afterEach(async () => {
  await dropIndex();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("vector store", () => {
  it("upserts and searches by vector similarity", async () => {
    await upsertEntryChunks(
      "2026-01-01-0900",
      [chunk("2026-01-01-0900", "about cats")],
      [[1, 0, 0]],
      1000
    );
    await upsertEntryChunks(
      "2026-02-01-0900",
      [chunk("2026-02-01-0900", "about dogs")],
      [[0, 1, 0]],
      2000
    );

    const results = await searchChunks([0.9, 0.1, 0], 1);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("about cats");
    expect(results[0].entryId).toBe("2026-01-01-0900");
  });

  it("replaces chunks on re-upsert of the same entry", async () => {
    const entryId = "2026-01-01-0900";
    await upsertEntryChunks(entryId, [chunk(entryId, "v1")], [[1, 0, 0]], 1);
    await upsertEntryChunks(entryId, [chunk(entryId, "v2")], [[1, 0, 0]], 2);

    const results = await searchChunks([1, 0, 0], 10);
    expect(results.filter((r) => r.entryId === entryId)).toHaveLength(1);
    expect(results[0].text).toBe("v2");
  });

  it("filters search results by date range", async () => {
    await upsertEntryChunks(
      "2026-01-01-0900",
      [chunk("2026-01-01-0900", "january note")],
      [[1, 0, 0]],
      1
    );
    await upsertEntryChunks(
      "2026-06-01-0900",
      [chunk("2026-06-01-0900", "june note")],
      [[1, 0, 0]],
      1
    );

    const results = await searchChunks([1, 0, 0], 10, {
      from: "2026-05-01",
      to: "2026-07-01",
    });
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("june note");
  });

  it("removes an entry's chunks on delete", async () => {
    const entryId = "2026-01-01-0900";
    await upsertEntryChunks(entryId, [chunk(entryId, "gone")], [[1, 0, 0]], 1);
    await deleteEntryChunks(entryId);
    expect(await searchChunks([1, 0, 0], 10)).toHaveLength(0);
  });

  it("reports indexed entries with their mtimes", async () => {
    await upsertEntryChunks(
      "2026-01-01-0900",
      [chunk("2026-01-01-0900", "a")],
      [[1, 0, 0]],
      111
    );
    const indexed = await getIndexedEntries();
    expect(indexed.get("2026-01-01-0900")).toBe(111);
  });

  it("search on an empty index returns nothing", async () => {
    expect(await searchChunks([1, 0, 0], 5)).toEqual([]);
  });
});
