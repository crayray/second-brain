---
name: test-journal-chat
description: Tests the journal chat at /api/chat by generating realistic user prompts, measuring retrieval and generation latency, and judging answer groundedness against real journal entries. Use when verifying chat still works after changes to prompts, retrieval, or models, when comparing chat models, or when the user asks to test, probe, or benchmark the journal chat.
disable-model-invocation: true
---

# Test Journal Chat

Exercises the RAG chat end to end against a running app: generate prompts a real user would ask, send them through `POST /api/chat`, measure latency, and judge whether answers are grounded in actual journal entries.

The probe script handles mechanical checks (stream shape, timing, think-block leaks). **You** judge answer quality — that part cannot be scripted.

## Preflight

Run from the app root (`SecondBrain/app`). All three must pass:

```bash
curl -s http://localhost:11434/api/version                        # Ollama up
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/chat   # app up (expect 200)
curl -s http://127.0.0.1:3000/api/entries                          # journal has entries
```

If Ollama is down: `ollama serve`. If the app is down: `npm run dev`, wait for `[watcher] initial index sync complete`.

If `/api/entries` returns `[]`, stop — there is nothing to retrieve and every answer will correctly refuse. Ask the user to add entries at `/write` first.

## Step 1: Generate 1–3 prompts

Read the real entries first, then write prompts that the journal can actually answer:

```bash
curl -s http://127.0.0.1:3000/api/entries
```

Pick 1–3 prompts across these types. With three prompts, prefer one grounded, one negative control, and one follow-up.

| Type | Purpose | Example |
|---|---|---|
| Grounded recall | Answer exists in one entry | "What have I been worried about lately?" |
| Temporal | Date-scoped retrieval | "What was on my mind in early July?" |
| Thematic synthesis | Spans several entries | "Have I written about anything I want to do alone?" |
| Negative control | Nothing in the journal covers it | "What did I write about starting my new job?" |
| Follow-up | Pronoun/ellipsis across turns | "Did I do anything to take my mind off it?" |

Rules for writing them:

- Write in the user's first-person voice, the way someone talks to their own journal. Under ~15 words.
- **Never leak the answer into the prompt.** No entry IDs, no dates copied from entries, no quoted entry text. The prompt must force real retrieval.
- The negative control must be *plausible* for this journal but absent from it — check the entries to confirm it is genuinely missing. Correct behavior is admitting it does not know, not inventing an answer.
- Avoid pure yes/no phrasing; it hides grounding failures.
- Keep one stable prompt across runs for latency comparison; vary the others so results are not overfit to one question.

<details>
<summary>Good vs bad prompts</summary>

| Bad | Why | Better |
|---|---|---|
| "Summarize entry 2026-07-05-0900" | Names the entry; no retrieval needed | "What was bothering me about the garden?" |
| "On July 5th I worried about tomatoes — what did I say?" | Answer is in the question | "What have I been worried about lately?" |
| "Am I happy?" | Unanswerable, no clear grounding target | "How have I been feeling this month?" |
| "Tell me about my trip to Japan" (journal has no Japan) | Good *only* as a labeled negative control | keep as negative control |

</details>

## Step 2: Run the probe

```bash
node .cursor/skills/test-journal-chat/scripts/chat-probe.mts \
  --label "what this run is testing" \
  --prompt "What have I been worried about lately?" \
  --follow-up "Did I do anything to take my mind off it?" \
  --prompt "What did I write about starting my new job?"
```

Each `--prompt` starts a fresh conversation; each `--follow-up` continues the previous one with full history, which is how the UI behaves.

| Flag | Default | Notes |
|---|---|---|
| `--prompt <text>` | — | Repeatable. At least one required. |
| `--follow-up <text>` | — | Repeatable. Must follow a `--prompt`. |
| `--label <text>` | none | Free text stored in the log. Use it — it is how runs stay comparable. |
| `--model <name>` | `$CHAT_MODEL` or `qwen3:4b` | **Label only.** Does not change the model the server uses. |
| `--base-url <url>` | `http://127.0.0.1:3000` | |
| `--timeout <ms>` | `300000` | Per turn. |
| `--json` | off | Machine-readable output. |
| `--no-log` | off | Skip appending to the results log. |

Exit codes: `0` all turns clean, `1` one or more turns had issues, `2` usage error.

Use `node`, not `npx tsx` — Node strips the TypeScript natively and `tsx` fails in sandboxed shells.

The script reports per turn: time to citations, time to first token, total time, chars/sec, citations, and any mechanical issues. Every run appends to `results/runs.jsonl` unless `--no-log` is passed.

## Step 3: Judge answer quality

The script cannot tell a grounded answer from a fluent hallucination. Read each answer against the cited entries and rate each dimension pass / partial / fail with a one-line reason:

- **Grounded** — every factual claim traces to a cited entry. No invented events, people, dates, or feelings. This is the one that matters most.
- **Citations match** — dates named in the prose match the citation dates, and the cited entries are actually relevant to the question.
- **Honest** — when the entries do not cover the question, the answer says so plainly. The negative control fails if the model invents anything.
- **Tone** — warm, reflective, brief. Not preachy, not generic self-help. These are explicit rules in the system prompt.
- **Clean** — no `<think>` leakage, valid markdown, no raw context dump.

If an answer is ungrounded, check whether retrieval or generation is at fault: look at the returned citations. Relevant citations plus a wrong answer means the model is at fault. Irrelevant citations means retrieval is at fault (see `src/lib/rag/retrieve.ts`, `k=6`).

## Step 4: Compare against previous runs

```bash
node .cursor/skills/test-journal-chat/scripts/compare-runs.mts --limit 5
node .cursor/skills/test-journal-chat/scripts/compare-runs.mts --model qwen3:4b
```

Deltas are computed against the previous run of the same model; anything over +30% is flagged `REGRESSION`.

Interpreting the three timings:

- **Time to citations** — isolates embedding plus vector search. A jump here points at the RAG path, not the model.
- **Time to first token** — includes the model's hidden reasoning. `qwen3:4b` thinks before emitting visible text, so this is long by design and is not a hang.
- **Total** — full answer.

Prefer the logged history over absolute numbers. For rough orientation, a healthy local run on `qwen3:4b` with a small journal has been ~8–16s to citations and ~70–100s to first token; the first request after a server restart is slower because the model is cold, so discard or clearly label a warm-up run.

## Step 5: Report

```markdown
## Journal chat probe — <label>

Model: <model> · <n>/<n> turns clean · <git sha>

| # | Prompt | Retrieval | First token | Total | Quality |
|---|--------|-----------|-------------|-------|---------|
| 1 | ...    | 8.2s      | 74.1s       | 96s   | pass    |

**Quality notes**
- Turn 1: grounded, cited Jul 5 garden entry correctly.
- Turn 3 (negative control): correctly said the journal has nothing about a new job.

**Performance vs last run**: first token +4%, no regression.

**Issues**: none / <what broke and where>
```

Lead with whether chat is working, then quality, then timings. Call out regressions and ungrounded answers explicitly — those are the reasons to run this at all.

## Testing a different model

`CHAT_MODEL` is read from the server's environment, so the model changes only by restarting the app:

```bash
ollama pull llama3.1:8b        # if not already present
CHAT_MODEL=llama3.1:8b npm run dev
```

Then probe with a matching `--model llama3.1:8b` label so the log attributes the run correctly. For a fair comparison use identical prompts across models and discard the first (cold) run.

Locally available models: check `curl -s http://localhost:11434/api/tags`.

## Mobile

There is no mobile client — the phone story is the same web app reached over Tailscale (see `SecondBrain Planning/Phase 2.2`). Until then, mobile coverage means the `/chat` UI at a phone viewport (390×844), which needs the browser surface below.

## Adding the browser surface later

Only the API surface is implemented. The log already records `surface: "api"` per run, so browser runs can append to the same file and stay comparable. A browser surface should drive the real UI at `/chat` (type into the input, submit, watch tokens stream) and additionally cover what the API cannot: streaming render, `Thinking…` placeholder, citation links resolving to `/entries/[id]`, error display, and layout at a phone viewport.

## Reference

**NDJSON contract** from `POST /api/chat` — one `citations` line first, then `token` lines, then `done`; `error` on failure. The probe fails a turn if citations arrive after tokens or `done` never arrives.

**Key files**

- `src/app/api/chat/route.ts` — endpoint, streaming, citation assembly
- `src/lib/chat/prompt.ts` — system prompt and context budget
- `src/lib/chat/think-filter.ts` — strips `<think>` blocks
- `src/lib/rag/retrieve.ts` — query embedding and top-k search
- `src/app/chat/chat-panel.tsx` — UI client

**Gotchas**

- Chat has no persistence. History lives in React state and the client resends it every turn; a refresh clears it.
- With a small journal, `k=6` means nearly every entry is cited on every question. Zero citations is a real failure; citing everything is not.
- If journal files were edited outside the app, run `npm run reindex` before probing or retrieval will be stale.
