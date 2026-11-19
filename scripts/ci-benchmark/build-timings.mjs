// Converts a Vitest JSON reporter file into the per-file timings used to seed
// the next run's shard allocation.
//
// Usage: node scripts/ci-benchmark/build-timings.mjs <vitest-json-report> <out.json>
//
// Per-file duration = endTime - startTime from the JSON reporter. startTime is the
// earliest test start in the file, so this covers test execution only, not
// transform or collection time before the first test. It is a planning estimate,
// not a precise cost.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [reportPath, outPath] = process.argv.slice(2);
if (!reportPath || !outPath) {
  console.error("usage: build-timings.mjs <vitest-json-report> <out.json>");
  process.exit(2);
}

const frontendRoot = fileURLToPath(
  new URL("../../apps/frontend/", import.meta.url),
);
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const results = report.testResults;
if (!Array.isArray(results) || results.length === 0) {
  console.error(
    `no testResults in ${reportPath}; refusing to write empty timings`,
  );
  process.exit(1);
}

/** @type {Record<string, number>} */
const files = {};
for (const result of results) {
  const rel = path
    .relative(frontendRoot, result.name)
    .split(path.sep)
    .join("/");
  const duration = result.endTime - result.startTime;
  if (!Number.isFinite(duration) || duration < 0) {
    console.error(
      `bad timing for ${rel}: start=${result.startTime} end=${result.endTime}`,
    );
    process.exit(1);
  }
  files[rel] = Math.max(1, Math.round(duration));
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      schema: 1,
      sourceReport: path.basename(reportPath),
      fileCount: Object.keys(files).length,
      files,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `wrote timings for ${Object.keys(files).length} files to ${outPath}`,
);
