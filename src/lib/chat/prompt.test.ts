import { describe, expect, it } from "vitest";
import { buildChatMessages } from "./prompt";
import type { SearchResult } from "@/lib/rag/store";

function result(entryId: string, text: string, date: string): SearchResult {
  return {
    id: `${entryId}#0`,
    entryId,
    path: `/journal/${entryId}.md`,
    date,
    chunkIndex: 0,
    text,
    distance: 0.5,
  };
}

describe("buildChatMessages", () => {
  it("puts retrieved entries with dates into the system prompt", () => {
    const messages = buildChatMessages({
      history: [{ role: "user", content: "What did I worry about?" }],
      chunks: [
        result("2026-07-05-0900", "worried about the garden", "2026-07-05T14:00:00.000Z"),
      ],
    });

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("worried about the garden");
    expect(messages[0].content).toContain("2026-07-05");
    expect(messages.at(-1)).toEqual({
      role: "user",
      content: "What did I worry about?",
    });
  });

  it("keeps prior conversation turns in order", () => {
    const history = [
      { role: "user" as const, content: "first question" },
      { role: "assistant" as const, content: "first answer" },
      { role: "user" as const, content: "follow-up" },
    ];
    const messages = buildChatMessages({ history, chunks: [] });
    expect(messages.slice(1)).toEqual(history);
  });

  it("trims retrieved context to fit the character budget", () => {
    const big = "x".repeat(10_000);
    const messages = buildChatMessages({
      history: [{ role: "user", content: "q" }],
      chunks: [
        result("2026-01-01-0900", big, "2026-01-01T09:00:00.000Z"),
        result("2026-01-02-0900", big, "2026-01-02T09:00:00.000Z"),
        result("2026-01-03-0900", big, "2026-01-03T09:00:00.000Z"),
      ],
    });
    // Budget is ~16k chars of context; three 10k chunks cannot all fit.
    expect(messages[0].content).toContain("2026-01-01");
    expect(messages[0].content.length).toBeLessThan(20_000);
  });

  it("tells the model when no entries were retrieved", () => {
    const messages = buildChatMessages({
      history: [{ role: "user", content: "q" }],
      chunks: [],
    });
    expect(messages[0].content).toContain("No journal entries");
  });
});
