// Renders a benchmark step-timing JSONL file (written by timed.sh) as a Markdown
// table, and appends it to $GITHUB_STEP_SUMMARY when running in Actions.
//
// Usage: node scripts/ci-benchmark/summarize.mjs <steps.jsonl> "<title>" [--note "<text>"]
// Setup steps (checkout, setup-node, npm ci) are not in this file on purpose: they
// are reported separately so the test/check timings stay comparable across variants.
import fs from "node:fs";

const [stepsPath, title, ...rest] = process.argv.slice(2);
if (!stepsPath || !title) {
  console.error(
    'usage: summarize.mjs <steps.jsonl> "<title>" [--note "<text>"]',
  );
  process.exit(2);
}
const noteIdx = rest.indexOf("--note");
const note = noteIdx >= 0 ? rest[noteIdx + 1] : null;

const rows = fs.existsSync(stepsPath)
  ? fs
      .readFileSync(stepsPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  : [];

const lines = [`### ${title}`, ""];
if (note) lines.push(`_${note}_`, "");
if (rows.length === 0) {
  lines.push("No timed steps recorded.");
} else {
  lines.push("| Step | Wall time (s) | Exit code |", "| --- | ---: | ---: |");
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${(r.durationMs / 1000).toFixed(1)} | ${r.exitCode} |`,
    );
  }
  const total = rows.reduce((s, r) => s + r.durationMs, 0);
  lines.push(
    `| **Total (timed steps)** | **${(total / 1000).toFixed(1)}** | |`,
  );
}
lines.push("");
const md = lines.join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
} else {
  process.stdout.write(md + "\n");
}
