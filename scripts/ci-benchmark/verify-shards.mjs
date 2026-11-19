// Verifies that the sharded run covered the same test files as the full suite.
//
// Usage:
//   node scripts/ci-benchmark/verify-shards.mjs \
//     --expected <vitest-list-json> --plans <dir-with-shard-plan-json> --count <N> \
//     [--merged <merged-vitest-json-report>] [--baseline <baseline-vitest-json-report>]
//
// Exits non-zero (failing the job) on: a missing shard plan, a file assigned to
// two shards, a file in the expected list that no shard ran, an unexpected file,
// or a merged report whose file set differs from the expected list. With
// --baseline, also prints a file/test count comparison (informational).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(
  new URL("../../apps/frontend/", import.meta.url),
);

/** @type {Record<string, string>} */
const args = parseArgs(process.argv.slice(2));
const expected = listFiles(readJson(required(args, "expected")));
const count = Number(required(args, "count"));
const problems = [];

// 1. Shard plans: exactly one per shard, union == expected, no overlaps.
const planDir = required(args, "plans");
/** @type {{ index: number, plan: { files: string[], mode: string, estimatedLoadMs?: number, unknownFiles?: string[] } }[]} */
const plans = [];
for (let i = 1; i <= count; i++) {
  const planPath = path.join(planDir, `shard-${i}-of-${count}.json`);
  if (!fs.existsSync(planPath)) {
    problems.push(`missing shard plan ${path.basename(planPath)}`);
    continue;
  }
  plans.push({ index: i, plan: readJson(planPath) });
}

/** @type {Map<string, number>} */
const owner = new Map();
for (const { index, plan } of plans) {
  if (!plan.files || plan.files.length === 0) {
    problems.push(`shard ${index} has no files (empty shard)`);
  }
  for (const file of plan.files ?? []) {
    if (owner.has(file)) {
      problems.push(
        `${file} assigned to shard ${owner.get(file)} and shard ${index}`,
      );
    }
    owner.set(file, index);
  }
}
for (const file of expected) {
  if (!owner.has(file)) problems.push(`not run by any shard: ${file}`);
}
for (const file of owner.keys()) {
  if (!expected.includes(file))
    problems.push(`shard ran unexpected file: ${file}`);
}

// 2. Merged report (optional): executed set must equal the expected set.
if (args.merged) {
  const merged = readJson(args.merged);
  const ran = /** @type {{ name: string }[]} */ (merged.testResults ?? []).map(
    (r) => relative(r.name),
  );
  const ranSet = new Set(ran);
  if (ranSet.size !== ran.length)
    problems.push("merged report contains duplicate files");
  for (const file of expected) {
    if (!ranSet.has(file)) problems.push(`merged report missing: ${file}`);
  }
  for (const file of ranSet) {
    if (!expected.includes(file))
      problems.push(`merged report has unexpected file: ${file}`);
  }
  console.log(
    `merged report: ${ranSet.size} files, ${countTests(merged)} tests`,
  );
}

// 3. Baseline comparison (informational, same source commit).
if (args.baseline) {
  const base = readJson(args.baseline);
  console.log(
    `baseline report: ${(base.testResults ?? []).length} files, ${countTests(base)} tests`,
  );
}

console.log(`expected test files: ${expected.length}`);
for (const { index, plan } of plans) {
  const load = plan.estimatedLoadMs ?? "n/a";
  console.log(
    `shard ${index}/${count}: ${plan.files.length} files, mode=${plan.mode}, estimatedLoadMs=${load}, unknownTimingFiles=${(plan.unknownFiles ?? []).length}`,
  );
}

if (problems.length) {
  console.error(`\nSHARD VERIFICATION FAILED (${problems.length} problem(s)):`);
  for (const p of problems.slice(0, 50)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("shard verification OK: every expected file ran exactly once");

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i] ?? "";
    out[key.replace(/^--/, "")] = argv[i + 1] ?? "";
  }
  return out;
}

/**
 * @param {Record<string, string>} args
 * @param {string} key
 * @returns {string}
 */
function required(args, key) {
  if (!args[key]) {
    console.error(`missing --${key}`);
    process.exit(2);
  }
  return args[key];
}

/** @param {string} p */
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** @param {string} abs */
function relative(abs) {
  return path.relative(frontendRoot, abs).split(path.sep).join("/");
}

/** @param {{ file: string }[]} list */
function listFiles(list) {
  return list.map((x) => relative(x.file)).sort();
}

/** @param {{ testResults?: { assertionResults?: unknown[] }[] }} report */
function countTests(report) {
  return (report.testResults ?? []).reduce(
    (n, r) => n + (r.assertionResults?.length ?? 0),
    0,
  );
}
