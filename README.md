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

## Testing

`npm test` runs the unit suite (Vitest, `src/**/*.test.ts`): prompt assembly,
`<think>` filtering, chunking, embeddings, the vector store, and journal CRUD.
Ollama is mocked there, so the suite never exercises a real model — it cannot
tell you whether chat still gives good answers.

### Chat probe skill

`.cursor/skills/test-journal-chat/` is a Cursor skill that covers the gap: it
drives the real `/api/chat` endpoint against a live model and checks that
answers are grounded in actual journal entries. Use it after changing the
chat model, the system prompt, or retrieval.

In Cursor, invoke the `test-journal-chat` skill and it will run the whole
workflow. To run the scripts directly (the app and Ollama must be up):

```bash
node .cursor/skills/test-journal-chat/scripts/chat-probe.mts \
  --label "baseline" \
  --prompt "What have I been worried about lately?" \
  --follow-up "Did I do anything to take my mind off it?"
```

Each `--prompt` starts a fresh conversation; each `--follow-up` continues the
previous one with full history, matching how the UI behaves. Use `node`, not
`npx tsx` — the scripts are `.mts` and rely on Node's native type stripping.

The skill starts by reading your real entries from `/api/entries`, then
generates 1-3 prompts a user would plausibly ask — including a *negative
control*, a question the journal genuinely cannot answer. That one matters
most: the correct response is admitting it doesn't know, so it catches the
model inventing memories.

The probe checks what can be measured mechanically, and reports per turn:

| Measurement | What a change tells you |
|---|---|
| Time to citations | Embedding + vector search only; isolates the RAG path |
| Time to first token | Includes qwen3's hidden reasoning, so it's long by design |
| Total time, chars/sec | Full answer throughput |
| Stream health | Citations arriving before tokens, missing `done`, `<think>` leaks, empty answers |

It deliberately does **not** score answer quality — a fluent hallucination
passes every mechanical check. Groundedness, citation accuracy, honesty, and
tone are judged by whoever reads the output; the skill provides the rubric.

Every run appends to `.cursor/skills/test-journal-chat/results/runs.jsonl`, so
latency is comparable over time:

```bash
node .cursor/skills/test-journal-chat/scripts/compare-runs.mts --limit 5
```

Deltas are computed against the previous run of the same model, and anything
over +30% is flagged as a regression. Note that `--model` on the probe is only
a label for the log — the server reads `CHAT_MODEL` at launch, so comparing
models means restarting the app (see [Models](#models)) and passing a matching
label. Discard the first run after a restart; the model is cold.

See `.cursor/skills/test-journal-chat/SKILL.md` for the prompt-writing rules
and the quality rubric.

## Troubleshooting

- **Chat returns a 502 / "model backend error"** — Ollama isn't running or
  the model isn't pulled. Run `ollama serve`, then `ollama list` to confirm
  `qwen3:4b` and `nomic-embed-text` are present.
- **Search results seem stale or missing** — run `npm run reindex`. The index
  is disposable; the markdown folder is always the source of truth.
- **Deleted `.data/` by accident** — that's fine. Restart the app or run
  `npm run reindex` and it rebuilds completely.
