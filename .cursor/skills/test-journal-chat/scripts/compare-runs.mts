/**
 * Prints recent chat-probe runs from results/runs.jsonl and flags latency
 * regressions against the previous run of the same model.
 *
 *   node .cursor/skills/test-journal-chat/scripts/compare-runs.mts [--model qwen3:4b] [--limit 5]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESULTS_LOG = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../results/runs.jsonl"
);

const REGRESSION_THRESHOLD = 0.3;

interface RunEntry {
  timestamp: string;
  label: string | null;
  surface: string;
  model: string;
  git: string | null;
  summary: {
    turns: number;
    failed: number;
    meanMsToCitations: number | null;
    meanMsToFirstToken: number | null;
    meanMsTotal: number | null;
  };
}

function parseArgs(argv: string[]) {
  let model: string | null = null;
  let limit = 5;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--model") model = argv[++i];
    else if (argv[i] === "--limit") limit = Number(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return { model, limit };
}

function loadRuns(): RunEntry[] {
  let raw: string;
  try {
    raw = readFileSync(RESULTS_LOG, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunEntry);
}

function seconds(value: number | null): string {
  return value === null ? "n/a" : `${(value / 1000).toFixed(1)}s`;
}

function delta(current: number | null, previous: number | null): string {
  if (current === null || previous === null || previous === 0) return "";
  const change = (current - previous) / previous;
  const sign = change >= 0 ? "+" : "";
  const flag = change > REGRESSION_THRESHOLD ? "  REGRESSION" : "";
  return ` (${sign}${(change * 100).toFixed(0)}%${flag})`;
}

const { model, limit } = parseArgs(process.argv.slice(2));
const runs = loadRuns().filter((run) => model === null || run.model === model);

if (runs.length === 0) {
  console.log(`no runs found in ${RESULTS_LOG}${model ? ` for model ${model}` : ""}`);
  process.exit(0);
}

for (const run of runs.slice(-limit)) {
  const previous = runs
    .slice(0, runs.indexOf(run))
    .reverse()
    .find((candidate) => candidate.model === run.model);
  console.log(
    `${run.timestamp}  ${run.model}  ${run.surface}  git:${run.git ?? "?"}  ${
      run.label ?? "(no label)"
    }`
  );
  console.log(
    `    ${run.summary.turns - run.summary.failed}/${run.summary.turns} passed | retrieval ${seconds(
      run.summary.meanMsToCitations
    )}${delta(run.summary.meanMsToCitations, previous?.summary.meanMsToCitations ?? null)}` +
      ` | first token ${seconds(run.summary.meanMsToFirstToken)}${delta(
        run.summary.meanMsToFirstToken,
        previous?.summary.meanMsToFirstToken ?? null
      )}` +
      ` | total ${seconds(run.summary.meanMsTotal)}${delta(
        run.summary.meanMsTotal,
        previous?.summary.meanMsTotal ?? null
      )}`
  );
}
