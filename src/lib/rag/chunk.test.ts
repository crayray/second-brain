import { describe, expect, it } from "vitest";
import { chunkEntry } from "./chunk";

const base = {
  id: "2026-07-06-1200",
  path: "/journal/2026/07/2026-07-06-1200.md",
  date: "2026-07-06T12:00:00.000Z",
};

describe("chunkEntry", () => {
  it("keeps a short entry as a single chunk with metadata", () => {
    const chunks = chunkEntry({ ...base, content: "A short thought." });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      text: "A short thought.",
      entryId: base.id,
      path: base.path,
      date: base.date,
      chunkIndex: 0,
    });
  });

  it("splits a long entry on paragraph boundaries", () => {
    const paragraph = "word ".repeat(300).trim(); // ~1500 chars each
    const content = [paragraph, paragraph, paragraph, paragraph].join("\n\n");
    const chunks = chunkEntry({ ...base, content });

    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should be dramatically over the ~800 token (~3200 char) budget.
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(3400);
    }
    // Paragraphs must not be cut mid-word; rejoining recovers all words.
    const allWords = chunks.flatMap((c) => c.text.split(/\s+/));
    expect(allWords).toHaveLength(1200);
    // Sequential chunk indexes.
    expect(chunks.map((c) => c.chunkIndex)).toEqual(
      chunks.map((_, i) => i)
    );
  });

  it("returns no chunks for empty content", () => {
    expect(chunkEntry({ ...base, content: "   " })).toEqual([]);
  });
});
