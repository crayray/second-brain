import type { SearchResult } from "@/lib/rag/store";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ~4k tokens of retrieved entries at ~4 chars/token. Combined with history
// and the answer this keeps the total context comfortably under 8k tokens,
// which is the speed budget for 3-8B models on this hardware.
const CONTEXT_CHAR_BUDGET = 16_000;

function formatChunk(chunk: SearchResult): string {
  const day = chunk.date.slice(0, 10);
  return `--- Entry from ${day} ---\n${chunk.text}`;
}

export function buildChatMessages({
  history,
  chunks,
}: {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  chunks: SearchResult[];
}): ChatMessage[] {
  const included: string[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const formatted = formatChunk(chunk);
    if (used + formatted.length > CONTEXT_CHAR_BUDGET && included.length > 0) {
      break;
    }
    included.push(
      formatted.length > CONTEXT_CHAR_BUDGET
        ? formatted.slice(0, CONTEXT_CHAR_BUDGET)
        : formatted
    );
    used += formatted.length;
  }

  const context =
    included.length > 0
      ? `Here are the journal entries retrieved for this conversation:\n\n${included.join("\n\n")}`
      : "No journal entries were retrieved for this question.";

  const system = [
    "You are a thoughtful, warm journaling companion. The user is the sole author of the journal entries provided below.",
    "Rules you must follow:",
    "- Base your answers ONLY on the journal entries provided. Never invent memories, events, or feelings that are not in the entries.",
    "- When you reference an entry, mention its date naturally (e.g. \"On July 5th you wrote...\").",
    "- If the entries don't contain enough information to answer, say so plainly and suggest what the user might journal about to explore it.",
    "- Be reflective and curious, not preachy. Short, honest answers beat long generic ones.",
    "",
    context,
  ].join("\n");

  return [{ role: "system", content: system }, ...history];
}
