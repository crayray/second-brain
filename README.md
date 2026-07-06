# Second Brain

A private journaling app with a locally hosted AI companion. Entries are plain
markdown files on disk; chat runs against a local Ollama model with RAG
(retrieval-augmented generation) over your own entries. Nothing leaves your
machine.

## Requirements

- Node.js 20+
- [Ollama](https://ollama.com) installed (`brew install ollama` or the Mac app)
- Two models pulled:

```bash
ollama pull qwen3:4b          # chat (generation)
ollama pull nomic-embed-text  # embeddings (indexing + retrieval)
```

## Starting the app

1. **Start Ollama** (skip if the Ollama menu-bar app is already running):

```bash
ollama serve
```

   Verify it's up: `curl http://localhost:11434/api/version`

2. **Install dependencies and start the app** (first run only for install):

```bash
npm install
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000).

On startup the app begins watching the journal folder and syncs the search
index automatically — look for `[watcher] initial index sync complete` in the
terminal. There is no separate indexer process to run.

For a production-mode build (slightly faster than dev mode):

```bash
npm run build
npm start
```

## Using the app

| Page | What it does |
|---|---|
| `/` | Browse entries, newest first, grouped by month |
| `/write` | Write a new entry (markdown + tags); also edits existing entries |
| `/chat` | Chat with your journal; answers stream in with citations |

Entries are just files in `~/SecondBrainJournal/` — you can also create or
edit them with any editor and the watcher will re-index within seconds.

## Ollama inference configuration

The app talks to Ollama two ways, both on localhost only:

- **Chat**: OpenAI-compatible endpoint `POST /v1/chat/completions` with
  `stream: true`, using `CHAT_MODEL`
- **Embeddings**: native endpoint `POST /api/embed`, using `EMBED_MODEL`

Because the app only depends on these API shapes, swapping models — or even
replacing Ollama with another OpenAI-compatible server — is a config change,
no code changes.

### Models

| Role | Default | Why |
|---|---|---|
| Chat | `qwen3:4b` (Q4) | Best quality at responsive speed (~10-12 tok/s) on an Intel i9; good context faithfulness, which matters most for a journal bot |
| Embeddings | `nomic-embed-text` | Fast on CPU, 768-dim vectors; embedding speed is not a bottleneck |

To try a different chat model (e.g. "quality mode"):

```bash
ollama pull llama3.1:8b
CHAT_MODEL=llama3.1:8b npm run dev
```

Expect ~4-6 tok/s from 8B models on Intel hardware — noticeably slower but
better prose. 13B+ models are not practical on this machine.

**Changing the embedding model** invalidates the existing index (different
vector space/dimensions). After changing `EMBED_MODEL`, rebuild:

```bash
EMBED_MODEL=<new-model> npm run reindex
```

### Context budget

Retrieved journal context is capped at roughly 4k tokens (see
`CONTEXT_CHAR_BUDGET` in `src/lib/chat/prompt.ts`), keeping the full prompt
comfortably under 8k tokens — the speed sweet spot for 3-8B models on CPU.
Retrieval fetches the top 6 chunks per question (`DEFAULT_K` in
`src/lib/rag/retrieve.ts`).

### Performance notes (Intel MacBook, CPU-only inference)

- First message after a quiet period is slower while Ollama loads the model
  into memory; subsequent messages are faster. Ollama keeps a model loaded
  ~5 minutes by default (`OLLAMA_KEEP_ALIVE` extends this).
- A full chat answer typically takes ~1 minute. Streaming makes this feel
  acceptable; this is the expected ceiling until an Apple Silicon upgrade.
- qwen3 is a reasoning model; its internal `<think>` output is generated
  (costing time) but filtered out server-side so you never see it.

### Privacy boundary

- The app binds to `127.0.0.1:3000` only.
- Ollama listens on `localhost:11434` and is only ever called by the app.
  Never expose the Ollama port to your network — remote access (Phase 2.2)
  should go through the web app over Tailscale instead.

## Configuration reference

All values are env vars with defaults (see `src/lib/config.ts`):

| Variable | Default | Purpose |
|---|---|---|
| `JOURNAL_DIR` | `~/SecondBrainJournal` | Where entry markdown files live |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |
| `CHAT_MODEL` | `qwen3:4b` | Generation model |
| `EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `DATA_DIR` | `<app>/.data` | Vector index location (disposable) |

## Scripts

- `npm run dev` — dev server on `127.0.0.1:3000`
- `npm run build` / `npm start` — production build and server
- `npm test` — unit tests (Vitest)
- `npm run lint` — ESLint
- `npm run reindex` — drop and rebuild the vector index from markdown

## Troubleshooting

- **Chat returns a 502 / "model backend error"** — Ollama isn't running or
  the model isn't pulled. Run `ollama serve`, then `ollama list` to confirm
  `qwen3:4b` and `nomic-embed-text` are present.
- **Search results seem stale or missing** — run `npm run reindex`. The index
  is disposable; the markdown folder is always the source of truth.
- **Deleted `.data/` by accident** — that's fine. Restart the app or run
  `npm run reindex` and it rebuilds completely.
