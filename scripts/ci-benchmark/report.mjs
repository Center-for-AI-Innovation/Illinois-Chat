// Renders run-level timings as Markdown from downloaded benchmark artifacts.
// Usage: node scripts/ci-benchmark/report.mjs <dir>  (dir holds benchmark-<job>/ folders)
// Correctness verdicts are NOT here; see compare-results.mjs. Missing inputs print as n/a.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: report.mjs <dir>");
  process.exit(2);
}

/**
 * @param {...string} p
 * @returns {string}
 */
const art = (...p) => path.join(root, ...p);
/**
 * @typedef {{ label: string, durationMs: number, exitCode: number }} Step
 */

/**
 * @param {string} file
 * @returns {Step[]}
 */
const readSteps = (file) =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
/**
 * @param {string} file
 * @returns {any}
 */
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
/**
 * @param {Step[] | undefined} steps
 * @param {string} prefix
 * @returns {Step | undefined}
 */
const find = (steps, prefix) =>
  (steps ?? []).find((s) => s.label.startsWith(prefix));
/**
 * @param {number | null | undefined} ms
 */
const fmt = (ms) => (ms == null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
/**
 * @param {Step | undefined} s
 */
const status = (s) =>
  s ? (s.exitCode === 0 ? "pass" : `FAIL (exit ${s.exitCode})`) : "n/a";

const base = readSteps(art("benchmark-baseline", "steps.jsonl"));
const baseSetup = readSteps(art("benchmark-baseline", "setup.jsonl"));
const merge = readSteps(art("benchmark-merge", "steps.jsonl"));
const shards = [1, 2, 3, 4].map((n) => ({
  n,
  steps: readSteps(art(`benchmark-shard-${n}`, "steps.jsonl")),
  setup: readSteps(art(`benchmark-shard-${n}`, "setup.jsonl")),
  plan: readJson(art(`benchmark-shard-${n}`, "plan", `shard-${n}-of-4.json`)),
}));
const snapshotKey =
  readJson(art("benchmark-resolve", "resolve.json"))?.timingsKey ||
  "(none: cold start)";

const cacheHits = [...baseSetup, ...shards.flatMap((x) => x.setup)]
  .filter((x) => x.label.startsWith("npm ci"))
  .map((x) => x.label.match(/npm-cache-hit=(\w+)/)?.[1] ?? "n/a");
const baseTest = find(base, "vitest run --coverage");
const baseCheck = find(base, "check-coverage.mjs");
const shardWalls = shards.map((s) => find(s.steps, "vitest shard")?.durationMs);
const maxShard = shardWalls.every((d) => d != null)
  ? Math.max(...shardWalls)
  : null;
const mergeWall = find(merge, "vitest merge")?.durationMs;
const verifyWall = find(merge, "verify shard")?.durationMs;
const mergeCheck = find(merge, "check-coverage.mjs (merged)")?.durationMs;
const shardPhase =
  maxShard != null &&
  mergeWall != null &&
  verifyWall != null &&
  mergeCheck != null
    ? maxShard + mergeWall + verifyWall + mergeCheck
    : null;
const baseTestPhase =
  baseTest && baseCheck ? baseTest.durationMs + baseCheck.durationMs : null;

const lines = [
  "## Frontend CI benchmark: timings",
  "",
  "Wall-clock per step; queue time excluded. Setup (`npm ci`) is shown separately. Trunk is excluded from both sides. The build trial is a new check absent from the baseline, so it is not in any speedup comparison.",
  "",
  "### Test phase: baseline vs. four shards",
  "",
  "| Variant | Wall time |",
  "| --- | ---: |",
  `| A baseline: vitest --coverage + check-coverage (sequential) | ${fmt(baseTestPhase)} |`,
  `| F shards critical path: slowest shard + merge + verify + check | ${fmt(shardPhase)} |`,
  `| F slowest single shard (vitest only) | ${fmt(maxShard)} |`,
  "",
  `npm cache hit per npm ci (setup-node, exact value): ${cacheHits.join(", ") || "n/a"}. A first timing-snapshot run is cold for timing data, not necessarily for npm.`,
  `Timing snapshot used by shards: \`${snapshotKey}\`. Partition mode "timed-lpt" means a snapshot was used; "native-hash" means none (not balanced).`,
  "",
  "| Shard | Partition mode | Files | Vitest wall | Estimated load | Setup (npm ci) | Result |",
  "| --- | --- | ---: | ---: | ---: | ---: | --- |",
  ...shards.map((s) => {
    const step = find(s.steps, "vitest shard");
    return `| ${s.n}/4 | ${s.plan?.mode ?? "n/a"} | ${s.plan?.files?.length ?? "n/a"} | ${fmt(step?.durationMs)} | ${fmt(s.plan?.estimatedLoadMs)} | ${fmt(find(s.setup, "npm ci")?.durationMs)} | ${status(step)} |`;
  }),
  "",
  "### Other steps",
  "",
  "| Job | Step | Wall time | Exit |",
  "| --- | --- | ---: | --- |",
];

/** @type {[string, string, Step | undefined][]} */
const rows = [
  ["A baseline", "npm ci (setup)", find(baseSetup, "npm ci")],
  ["A baseline", "npm run typecheck", find(base, "npm run typecheck")],
  [
    "B typecheck",
    "npm run typecheck",
    find(
      readSteps(art("benchmark-typecheck", "steps.jsonl")),
      "npm run typecheck",
    ),
  ],
  [
    "C bun check (1.4.4, experimental)",
    "bun check",
    find(readSteps(art("benchmark-bun-check", "steps.jsonl")), "bun check"),
  ],
  [
    "D oxlint (1.94.0, experimental)",
    "oxlint",
    find(readSteps(art("benchmark-oxlint", "steps.jsonl")), "oxlint"),
  ],
  [
    "E npm run lint (ESLint)",
    "npm run lint",
    find(readSteps(art("benchmark-eslint", "steps.jsonl")), "npm run lint"),
  ],
  [
    "H build trial (not in baseline)",
    "npm run build:self-hosted",
    find(readSteps(art("benchmark-build", "steps.jsonl")), "npm run build"),
  ],
];
for (const [job, step, s] of rows) {
  lines.push(
    `| ${job} | ${step} | ${fmt(/** @type {Step | undefined} */ (s)?.durationMs)} | ${status(s)} |`,
  );
}

const sel = readJson(art("benchmark-affected", "affected", "selection.json"));
const affRun = find(
  readSteps(art("benchmark-affected", "steps.jsonl")),
  "vitest",
);
const affReport = readJson(
  art("benchmark-affected", "affected", "report.json"),
);
lines.push("", "### Affected-tests trial", "");
if (!sel) {
  lines.push("Selection missing: not measured.");
} else if (sel.mode === "NO_SAMPLE") {
  lines.push(
    `NO meaningful sample (${sel.reason}). Nothing was run; this is not a speedup.`,
  );
} else {
  const executed = affReport?.testResults?.length;
  lines.push(
    `Mode ${sel.mode}: ${sel.reason}. Base \`${sel.base}\`, merge-base \`${sel.mergeBase?.slice(0, 10)}\`. Wall ${fmt(affRun?.durationMs)}, exit ${affRun?.exitCode ?? "n/a"}, files executed ${executed ?? "n/a"}.`,
  );
  if (executed === 0)
    lines.push("Zero tests executed: this is NOT a speedup measurement.");
  if (sel.mode === "FULL")
    lines.push(
      "FULL mode runs the whole suite without coverage, so it is not comparable to the coverage run.",
    );
}

process.stdout.write(lines.join("\n") + "\n");
