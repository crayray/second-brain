<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Standard commands live in `README.md` and `package.json` scripts (`dev`, `build`, `lint`, `test`, `reindex`). Notes below cover only non-obvious startup/run caveats for this environment.

### Services
- **Next.js app** (`npm run dev`) — serves UI + API and runs the journal file-watcher/indexer in-process (`src/instrumentation.ts`). Binds to `127.0.0.1:3000`. On startup wait for `[watcher] initial index sync complete`.
- **Ollama** (`ollama serve` on `localhost:11434`) — provides chat generation (`qwen3:4b`) and embeddings (`nomic-embed-text`). Required for `/chat` and search; the browse (`/`) and write (`/write`) pages work without it. Ollama and both models are preinstalled in the VM snapshot.

### Non-obvious caveats
- Ollama is **not** systemd-managed here (systemd isn't running in the VM). Start it manually, e.g. `ollama serve` in a background/tmux session, before using chat or search.
- **Ollama segfault workaround (critical):** Ollama auto-selects the `sapphirerapids` CPU kernel, which uses AMX instructions that segfault in this VM (`general protection fault in libggml-cpu-sapphirerapids.so`). The fix (already applied in the snapshot) is to move `/usr/local/lib/ollama/libggml-cpu-sapphirerapids.so` aside so it falls back to an AVX512 kernel. If Ollama is ever reinstalled or upgraded, re-apply this or all text generation will crash.
- `qwen3:4b` is a reasoning model running CPU-only (4 cores); a full chat answer can take several minutes and the first token is delayed while it "thinks". This is expected, not a hang. The internal `<think>` output is filtered server-side.
- The vector index at `.data/` and the journal at `~/SecondBrainJournal/` are disposable/rebuildable (`npm run reindex`); markdown files are the source of truth.
