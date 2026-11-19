// Verifies that the sharded run matches the baseline run on the same commit.
//
// Usage: node scripts/ci-benchmark/compare-results.mjs \
//   --baseline-report <json> --merged-report <json> \
//   --baseline-lcov <info> --merged-lcov <info>
//
// Checks (any difference or missing input exits 1):
// - executed test files, and per file the number of tests per status
// - per-file LF/LH (lines found/hit) from LCOV, and the check-coverage.mjs bucket totals
// Per-line hit counts are NOT compared: they may vary between runs. Diagnostics list every mismatch.
import fs from "node:fs";

// Same directory prefixes as apps/frontend/scripts/check-coverage.mjs.
const BUCKETS = [
  "src/utils/",
  "src/hooks/",
  "src/pages/api/",
  "src/app/api/",
  "src/components/",
];

/** @type {Record<string, string | undefined>} */
const args = parseArgs(process.argv.slice(2));
/** @type {string[]} */
const problems = [];
/** @type {string[]} */
const out = [];

const baseReport = readRequired(
  "baseline-report",
  args["baseline-report"],
  readJson,
);
const mergedReport = readRequired(
  "merged-report",
  args["merged-report"],
  readJson,
);
const baseLcov = readRequired("baseline-lcov", args["baseline-lcov"], readLcov);
const mergedLcov = readRequired("merged-lcov", args["merged-lcov"], readLcov);

if (baseReport && mergedReport) compareTests(baseReport, mergedReport);
if (baseLcov && mergedLcov) compareLcov(baseLcov, mergedLcov);

out.unshift(
  "### Baseline vs. merged shards: verification",
  "",
  problems.length
    ? `**FAILED**: ${problems.length} difference(s) or missing input(s).`
    : "**PASSED**: executed test files, test statuses, per-file LCOV line totals and bucket totals all match.",
  "",
);
console.log(out.join("\n"));
if (problems.length) {
  console.log("Differences:");
  for (const p of problems.slice(0, 60)) console.log(`- ${p}`);
  process.exit(1);
}

/**
 * @param {any} base
 * @param {any} merged
 */
function compareTests(base, merged) {
  const a = testIndex(base);
  const b = testIndex(merged);
  out.push(`Test files: baseline ${a.size}, merged ${b.size}`);
  for (const file of a.keys())
    if (!b.has(file)) problems.push(`test file only in baseline: ${file}`);
  for (const file of b.keys())
    if (!a.has(file)) problems.push(`test file only in merged: ${file}`);
  for (const [file, statuses] of a) {
    const other = b.get(file);
    if (!other) continue;
    if (JSON.stringify(statuses) !== JSON.stringify(other)) {
      problems.push(
        `tests differ in ${file}: baseline ${JSON.stringify(statuses)} vs merged ${JSON.stringify(other)}`,
      );
    }
  }
  out.push(`Tests (all statuses): baseline ${sum(a)}, merged ${sum(b)}`, "");
}

/**
 * @param {Map<string, { lf: number, lh: number }>} base
 * @param {Map<string, { lf: number, lh: number }>} merged
 */
function compareLcov(base, merged) {
  for (const file of new Set([...base.keys(), ...merged.keys()])) {
    const x = base.get(file);
    const y = merged.get(file);
    if (!x) problems.push(`coverage record only in merged: ${file}`);
    else if (!y) problems.push(`coverage record only in baseline: ${file}`);
    else if (x.lf !== y.lf || x.lh !== y.lh) {
      problems.push(
        `LCOV lines differ in ${file}: baseline ${x.lh}/${x.lf} vs merged ${y.lh}/${y.lf}`,
      );
    }
  }
  for (const prefix of BUCKETS) {
    const x = bucketTotals(base, prefix);
    const y = bucketTotals(merged, prefix);
    out.push(
      `${prefix.padEnd(18)} baseline ${x.lh}/${x.lf}  merged ${y.lh}/${y.lf}`,
    );
    if (x.lf !== y.lf || x.lh !== y.lh)
      problems.push(
        `bucket ${prefix} differs: ${x.lh}/${x.lf} vs ${y.lh}/${y.lf}`,
      );
  }
  out.push("");
}

/** Map of relative test file -> { status: count } from a Vitest JSON report. */
/**
 * @param {any} report
 * @returns {Map<string, Record<string, number>>}
 */
function testIndex(report) {
  const map = new Map();
  for (const file of report.testResults ?? []) {
    /** @type {Record<string, number>} */
    const counts = {};
    for (const t of file.assertionResults ?? [])
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    map.set(relPath(file.name), counts);
  }
  return map;
}

/**
 * @param {Map<string, Record<string, number>>} index
 * @returns {number}
 */
function sum(index) {
  let n = 0;
  for (const counts of index.values())
    for (const v of Object.values(counts)) n += v;
  return n;
}

/** Map of relative source file -> { lf, lh } from an lcov.info file. */
/**
 * @param {string} text
 * @returns {Map<string, { lf: number, lh: number }>}
 */
function readLcov(text) {
  const map = new Map();
  for (const rec of text.split("end_of_record")) {
    const sf = rec.match(/^SF:(.+)$/m)?.[1];
    if (!sf) continue;
    const lf = Number(rec.match(/^LF:(\d+)$/m)?.[1] ?? NaN);
    const lh = Number(rec.match(/^LH:(\d+)$/m)?.[1] ?? NaN);
    map.set(relPath(sf.trim()), { lf, lh });
  }
  return map;
}

/**
 * @param {Map<string, { lf: number, lh: number }>} map
 * @param {string} prefix
 */
function bucketTotals(map, prefix) {
  let lf = 0;
  let lh = 0;
  for (const [file, v] of map) {
    if (!file.startsWith(prefix)) continue;
    lf += v.lf;
    lh += v.lh;
  }
  return { lf, lh };
}

/** Repo-absolute or workspace-absolute path -> path relative to apps/frontend. */
/**
 * @param {string} p
 * @returns {string}
 */
function relPath(p) {
  const marker = "apps/frontend/";
  const i = p.indexOf(marker);
  return (i >= 0 ? p.slice(i + marker.length) : p).split("\\").join("/");
}

/** Reads a required input; a missing or unreadable file is a verification failure. */
/**
 * @template T
 * @param {string} label
 * @param {string | undefined} file
 * @param {(text: string) => T} parse
 * @returns {T | null}
 */
function readRequired(label, file, parse) {
  if (!file || !fs.existsSync(file)) {
    problems.push(`missing input ${label}${file ? ` (${file})` : ""}`);
    return null;
  }
  try {
    return parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    problems.push(
      `unreadable input ${label}: ${/** @type {Error} */ (err).message}`,
    );
    return null;
  }
}

/**
 * @param {string} text
 * @returns {any}
 */
function readJson(text) {
  const v = JSON.parse(text);
  if (!Array.isArray(v.testResults)) throw new Error("no testResults array");
  return v;
}

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 2)
    out[(argv[i] ?? "").replace(/^--/, "")] = argv[i + 1] ?? "";
  return out;
}
