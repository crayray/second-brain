import os from "node:os";
import path from "node:path";

export interface AppConfig {
  /** Folder where journal markdown files live. The source of truth. */
  journalDir: string;
  /** Base URL of the Ollama server (OpenAI-compatible API under /v1). */
  ollamaBaseUrl: string;
  /** Model used for chat generation. */
  chatModel: string;
  /** Model used for embeddings. */
  embedModel: string;
  /** App-owned data dir (vector index etc). Disposable and rebuildable. */
  dataDir: string;
}

// Read env lazily so tests can override per-test.
export function getConfig(): AppConfig {
  return {
    journalDir:
      process.env.JOURNAL_DIR ?? path.join(os.homedir(), "SecondBrainJournal"),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    chatModel: process.env.CHAT_MODEL ?? "qwen3:4b",
    embedModel: process.env.EMBED_MODEL ?? "nomic-embed-text",
    dataDir: process.env.DATA_DIR ?? path.join(process.cwd(), ".data"),
  };
}
