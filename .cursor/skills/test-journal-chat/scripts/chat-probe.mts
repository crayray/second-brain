/**
 * Sends prompts to the journal chat and reports latency, streaming health, and
 * citations. Run from the app root:
 *
 *   npx tsx .cursor/skills/test-journal-chat/scripts/chat-probe.ts \
 *     --prompt "What have I been worried about lately?"
 *
 * Standalone by design: no imports from src/, so it can probe a running server
 * without loading app config.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESULTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../results"
);
const RESULTS_LOG = path.join(RESULTS_DIR, "runs.jsonl");

interface Citation {
  entryId: string;
  date: string;
  excerpt: string;
}

interface TurnResult {
  conversation: number;
  turn: number;
  prompt: string;
  ok: boolean;
  msToCitations: number | null;
  msToFirstToken: number | null;
  msTotal: number;
  chars: number;
  charsPerSecond: number;
  citationCount: number;
  citations: Citation[];
  answer: string;
  issues: string[];
}

interface Options {
  baseUrl: string;
  label: string;
  model: string;
  timeoutMs: number;
  json: boolean;
  log: boolean;
  turns: { prompt: string; followUp: boolean }[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    baseUrl: process.env.CHAT_PROBE_BASE_URL ?? "http://127.0.0.1:3000",
    label: "",
    model: process.env.CHAT_MODEL ?? "qwen3:4b",
    timeoutMs: 300_000,
    json: false,
    log: true,
    turns: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      return value;
    };
    switch (arg) {
      case "--prompt":
        options.turns.push({ prompt: next(), followUp: false });
        break;
      case "--follow-up":
        options.turns.push({ prompt: next(), followUp: true });
        break;
      case "--base-url":
        options.baseUrl = next().replace(/\/$/, "");
        break;
      case "--label":
        options.label = next();
        break;
      case "--model":
        options.model = next();
        break;
      case "--timeout":
        options.timeoutMs = Number(next());
        break;
      case "--json":
        options.json = true;
        break;
      case "--no-log":
        options.log = false;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (options.turns.length === 0) {
    throw new Error("at least one --prompt is required");
  }
  if (options.turns[0].followUp) {
    throw new Error("--follow-up must come after a --prompt");
  }
  return options;
}

async function runTurn(
  history: { role: "user" | "assistant"; content: string }[],
  options: Options
): Promise<Omit<TurnResult, "conversation" | "turn" | "prompt">> {
  const issues: string[] = [];
  const started = performance.now();
  const since = () => Math.round(performance.now() - started);

  let msToCitations: number | null = null;
  let msToFirstToken: number | null = null;
  let citations: Citation[] = [];
  let answer = "";
  let sawDone = false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const res = await fetch(`${options.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      issues.push(`http ${res.status} from /api/chat`);
      return {
        ok: false,
        msToCitations,
        msToFirstToken,
        msTotal: since(),
        chars: 0,
        charsPerSecond: 0,
        citationCount: 0,
        citations,
        answer,
        issues,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-ndjson")) {
      issues.push(`unexpected content-type: ${contentType}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handle = (line: string) => {
      let event: { type?: string; text?: string; citations?: Citation[]; message?: string };
      try {
        event = JSON.parse(line);
      } catch {
        issues.push(`unparseable NDJSON line: ${line.slice(0, 80)}`);
        return;
      }
      if (event.type === "citations") {
        if (msToFirstToken !== null) issues.push("citations arrived after first token");
        msToCitations = since();
        citations = event.citations ?? [];
      } else if (event.type === "token") {
        if (msToCitations === null && msToFirstToken === null) {
          issues.push("token arrived before citations");
        }
        msToFirstToken ??= since();
        answer += event.text ?? "";
      } else if (event.type === "done") {
        sawDone = true;
      } else if (event.type === "error") {
        issues.push(`stream error: ${event.message}`);
      } else {
        issues.push(`unknown event type: ${String(event.type)}`);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() !== "") handle(line);
      }
    }
    if (buffer.trim() !== "") handle(buffer);
  } catch (error) {
    const aborted = controller.signal.aborted;
    issues.push(
      aborted ? `timed out after ${options.timeoutMs}ms` : `request failed: ${String(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!sawDone) issues.push("stream ended without a done event");
  if (answer.trim() === "") issues.push("empty answer");
  // Matches <think>, <thinking>, <redacted_thinking>, etc. — reasoning models
  // vary the tag name across versions/templates, and any of them leaking
  // past the server-side filter is the same failure.
  if (/<\/?[a-z_]*think[a-z_]*>/i.test(answer)) issues.push("think-block leaked into answer");
  if (citations.length === 0) issues.push("no citations returned");

  const msTotal = since();
  return {
    ok: issues.length === 0,
    msToCitations,
    msToFirstToken,
    msTotal,
    chars: answer.length,
    charsPerSecond: msTotal > 0 ? Number(((answer.length / msTotal) * 1000).toFixed(1)) : 0,
    citationCount: citations.length,
    citations,
    answer,
    issues,
  };
}

function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function mean(values: number[]): number | null {
  const usable = values.filter((v): v is number => typeof v === "number");
  if (usable.length === 0) return null;
  return Math.round(usable.reduce((a, b) => a + b, 0) / usable.length);
}

function formatReport(results: TurnResult[], options: Options): string {
  const lines: string[] = [];
  const ms = (value: number | null) => (value === null ? "n/a" : `${(value / 1000).toFixed(1)}s`);

  lines.push(`model: ${options.model}   base: ${options.baseUrl}`);
  if (options.label) lines.push(`label: ${options.label}`);
  lines.push("");

  for (const result of results) {
    const tag = `[${result.conversation}.${result.turn}]`;
    lines.push(`${tag} ${result.ok ? "PASS" : "FAIL"}  ${result.prompt}`);
    lines.push(
      `      retrieval ${ms(result.msToCitations)} | first token ${ms(
        result.msToFirstToken
      )} | total ${ms(result.msTotal)} | ${result.chars} chars @ ${result.charsPerSecond} ch/s | ${
        result.citationCount
      } citations`
    );
    for (const citation of result.citations) {
      lines.push(`      cite ${citation.date.slice(0, 10)} ${citation.entryId}`);
    }
    for (const issue of result.issues) {
      lines.push(`      ISSUE ${issue}`);
    }
    lines.push("");
    lines.push(
      result.answer
        .trim()
        .split("\n")
        .map((line) => `      | ${line}`)
        .join("\n")
    );
    lines.push("");
  }

  const failed = results.filter((r) => !r.ok).length;
  lines.push(
    `summary: ${results.length - failed}/${results.length} passed | mean first token ${ms(
      mean(results.map((r) => r.msToFirstToken).filter((v): v is number => v !== null))
    )} | mean total ${ms(mean(results.map((r) => r.msTotal)))}`
  );
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const results: TurnResult[] = [];
  let history: { role: "user" | "assistant"; content: string }[] = [];
  let conversation = 0;
  let turn = 0;

  for (const { prompt, followUp } of options.turns) {
    if (followUp) {
      turn++;
    } else {
      history = [];
      conversation++;
      turn = 1;
    }
    history.push({ role: "user", content: prompt });

    const result = await runTurn(history, options);
    history.push({ role: "assistant", content: result.answer });
    results.push({ conversation, turn, prompt, ...result });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    label: options.label || null,
    surface: "api",
    model: options.model,
    baseUrl: options.baseUrl,
    git: gitSha(),
    summary: {
      turns: results.length,
      failed: results.filter((r) => !r.ok).length,
      meanMsToCitations: mean(
        results.map((r) => r.msToCitations).filter((v): v is number => v !== null)
      ),
      meanMsToFirstToken: mean(
        results.map((r) => r.msToFirstToken).filter((v): v is number => v !== null)
      ),
      meanMsTotal: mean(results.map((r) => r.msTotal)),
    },
    turns: results,
  };

  if (options.log) {
    mkdirSync(RESULTS_DIR, { recursive: true });
    appendFileSync(RESULTS_LOG, `${JSON.stringify(entry)}\n`);
  }

  console.log(options.json ? JSON.stringify(entry, null, 2) : formatReport(results, options));
  process.exit(entry.summary.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(String(error));
  process.exit(2);
});
