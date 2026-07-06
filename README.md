# Second Brain

A private journaling app with a locally hosted AI companion. Entries are plain
markdown files on disk; chat runs against a local Ollama model with RAG over
your own entries. Nothing leaves your machine.

## Requirements

- Node.js 20+
- [Ollama](https://ollama.com) with two models pulled:

```bash
ollama pull qwen3:4b          # chat
ollama pull nomic-embed-text  # embeddings
```

## Run

```bash
ollama serve   # if the Ollama app isn't already running
npm install
npm run dev    # http://localhost:3000
```

The app binds to `127.0.0.1` only. Ollama is only ever reached via the app on
`localhost:11434` and must never be exposed beyond localhost.

## How it works

- **Entries** live in `~/SecondBrainJournal/` as `YYYY/MM/YYYY-MM-DD-HHmm.md`
  with YAML frontmatter (`date`, `source`, `tags`). The folder is the source
  of truth — edit it with any tool; a file watcher re-indexes changes within
  seconds.
- **Index** is an embedded LanceDB vector store in `.data/` (gitignored,
  disposable). Rebuild any time with `npm run reindex`.
- **Chat** (`/chat`) embeds your question, retrieves the most relevant
  entries, and streams an answer from the local model with citations linking
  back to the source entries.

## Configuration

All values are env vars with defaults (see `src/lib/config.ts`):

| Variable | Default |
|---|---|
| `JOURNAL_DIR` | `~/SecondBrainJournal` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `CHAT_MODEL` | `qwen3:4b` |
| `EMBED_MODEL` | `nomic-embed-text` |
| `DATA_DIR` | `<app>/.data` |

## Scripts

- `npm run dev` — dev server (localhost only)
- `npm test` — unit tests (Vitest)
- `npm run reindex` — drop and rebuild the vector index from markdown
