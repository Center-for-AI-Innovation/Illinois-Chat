// Decides what the affected-tests trial runs, from a git diff. Run from the repo root.
//
// Usage: node scripts/ci-benchmark/select-affected.mjs --base <ref> [--head <ref>] --out <file>
//
// Modes:
//   NO_SAMPLE  no frontend change outside benchmark infra. Nothing measured; not a speedup.
//   FULL       any input that could change results beyond a static import graph:
//              broad config/setup/lockfile/shared-helper changes, any non-module file
//              under apps/frontend (json, sql, css, public/locales, ...), any module
//              outside src/ and __tests__/, or any deleted/renamed-away file.
//   AFFECTED   only module files under src/ and __tests__/ changed. Changed test files
//              run directly; changed non-test modules go to `vitest related` (static graph).
//
// Static-graph limits (documented, not solved here): dynamic imports with computed
// paths, string-resolved vi.mock targets, and runtime file reads are not seen by the graph.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** @type {Record<string, string | undefined>} */
const args = parseArgs(process.argv.slice(2));
if (!args.base || !args.out) {
  console.error(
    "usage: select-affected.mjs --base <ref> [--head <ref>] --out <file>",
  );
  process.exit(2);
}
const head = args.head ?? "HEAD";
const prefix = "apps/frontend/";

/**
 * @param {...string} a
 * @returns {string}
 */
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const mergeBase = git("merge-base", args.base, head);
// --no-renames: a rename shows as delete + add, so the deleted old path forces FULL.
const diff = git("diff", "--name-status", "--no-renames", mergeBase, head)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status = "", file = ""] = line.split("\t");
    return { status, file };
  })
  .filter(({ file }) => file.startsWith(prefix))
  .map(({ status, file }) => ({ status, file: file.slice(prefix.length) }))
  .filter(({ file }) => !file.startsWith("scripts/ci-benchmark/"));

const BROAD = [
  /^package(-lock)?\.json$/,
  /^vitest\.(config|setup)\.ts$|^vitest\.config\.mts$/,
  /^tsconfig.*\.json$/,
  /^next\.config\.mjs$|^next-env\.d\.ts$|^\.eslintrc\.cjs$/,
  /^(database\.types|fonts)\.ts$|^empty-module\.js$/,
  /^src\/test-utils\//,
  /^__tests__\/(?!.*\.(test|spec)\.tsx?$)/, // shared helpers, not test files
];
const MODULE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST = /\.(test|spec)\.tsx?$/;

/** @type {string[]} */
const fullReasons = [];
/** @type {string[]} */
const directTests = [];
/** @type {string[]} */
const relatedSources = [];
for (const { status, file } of diff) {
  if (status.startsWith("D"))
    fullReasons.push(`deleted or renamed away: ${file}`);
  else if (BROAD.some((re) => re.test(file)))
    fullReasons.push(`broad input: ${file}`);
  else if (!MODULE.test(file)) fullReasons.push(`non-module input: ${file}`);
  else if (!(file.startsWith("src/") || file.startsWith("__tests__/")))
    fullReasons.push(`module outside src/ and __tests__/: ${file}`);
  else if (TEST.test(file)) directTests.push(file);
  else relatedSources.push(file);
}

let mode;
let reason;
if (fullReasons.length) {
  mode = "FULL";
  reason =
    fullReasons.slice(0, 5).join("; ") +
    (fullReasons.length > 5 ? ` (+${fullReasons.length - 5} more)` : "");
} else if (directTests.length + relatedSources.length === 0) {
  mode = "NO_SAMPLE";
  reason = "no frontend change outside benchmark infrastructure";
} else {
  mode = "AFFECTED";
  reason = `${directTests.length} changed test file(s) run directly; ${relatedSources.length} changed module(s) via static graph`;
}

const result = {
  mode,
  reason,
  base: args.base,
  head,
  mergeBase,
  directTests: directTests.filter((f) =>
    fs.existsSync(path.join("apps/frontend", f)),
  ),
  relatedSources,
  fullReasons,
};
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, JSON.stringify(result, null, 2) + "\n");
console.log(`affected selection: mode=${mode}`);
console.log(`  reason: ${reason}`);
console.log(`  mergeBase: ${mergeBase}`);

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
