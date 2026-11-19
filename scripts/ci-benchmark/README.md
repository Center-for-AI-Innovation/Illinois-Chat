# Frontend CI benchmark (experiment)

An isolated experiment comparing the current frontend CI steps with candidate
optimizations on GitHub Actions. **Not a production rollout.** It is not a PR check,
deploys nothing, uses no secrets or network credentials, and posts nothing.

- Workflow: `.github/workflows/frontend-ci-benchmark.yml`. Every job is guarded to
  `refs/heads/bench/frontend-ci`, so a dispatch from another ref does nothing.
- Runs on push to `bench/frontend-ci` and on manual dispatch. No PR is needed.
- Canonical PR Checks and all other workflows are unchanged.
- Observed results from the three runs on one commit: [RESULTS.md](RESULTS.md).

## Files

| Location | Purpose |
| --- | --- |
| `scripts/ci-benchmark/` (repo root) | Helpers that need only Node built-ins. Outside `apps/frontend`, so the canonical `tsconfig.build.json` never type-checks them |
| `apps/frontend/scripts/ci-benchmark/` | Things that must resolve frontend dependencies: the Vitest sequencer and config, the Bun tsconfig, the oxlint config |

Root helpers: `timed.sh` (step timer), `summarize.mjs`, `build-timings.mjs`,
`shard-allocation.mjs` (+ `.test.mjs`), `verify-shards.mjs`, `select-affected.mjs`,
`report.mjs`, `compare-results.mjs`. Run from the repo root.

Typecheck: the root helpers pass a strict JSDoc check
(`tsc --allowJs --checkJs --strict --noUncheckedIndexedAccess`, with the frontend's
`@types/node`). That check is ad hoc and is NOT part of the canonical command.

## Jobs

| Job | Measures | Notes |
| --- | --- | --- |
| resolve-timings | Picks ONE timings cache key | Shards restore that exact key, so a baseline that saves a newer snapshot mid-run cannot change their partition |
| A baseline | typecheck, then `vitest run --coverage`, then `check-coverage.mjs` | The same steps as PR Checks, minus Trunk. Saves per-file timings and `lcov.info` |
| B typecheck | canonical `npm run typecheck` | Independent of the shards |
| H build trial | `npm run build:self-hosted` on Node 20 | **New check, absent from the baseline.** No secrets and no dummy env. A missing config is a real failure. Never part of a speedup comparison |
| C bun check | `bun check` (Bun 1.4.4) on a benchmark-only tsconfig | Experimental. Failure is real |
| D oxlint | oxlint 1.94.0, outside the lockfile, read-only | Diagnostics exit 1. Existing backlog, not a regression |
| E npm run lint | existing ESLint script | For comparison with D |
| F shards x4 | `vitest run --shard=i/4 --coverage --reporter=blob` | Same pinned snapshot for all four |
| G merge | merges the four blobs once, verifies the file set, runs the **unchanged** `check-coverage.mjs` | Fails if any shard output is missing |
| I affected | see below | Trial only |
| report | timings, then `compare-results.mjs` | The job FAILS on any verification mismatch or missing input |

Setup (`npm ci`) is timed in a separate file from the test and check steps. The
`npm-cache-hit` value is in its label.

## Verification (`compare-results.mjs`)

Baseline and merged shards must agree on:
- executed test files, and per file the count of tests by status;
- per-file LCOV `LF`/`LH` (lines found/hit);
- the five `check-coverage.mjs` bucket totals (`src/utils`, `src/hooks`, `src/pages/api`,
  `src/app/api`, `src/components`).

Per-line hit counts are NOT compared. Any difference, or any missing input, exits 1
and lists each mismatch. `verify-shards.mjs` separately checks that the four partitions
cover the full `vitest list` file set exactly once.

## Partitioning and cold/warm

- **No snapshot (cold start):** Vitest's native hash-based `--shard`. Deterministic, not
  time-balanced. The report labels it `native-hash`.
- **Snapshot present (warm):** per-file durations from the previous baseline (`endTime -
  startTime` in the JSON reporter, which covers test execution only) feed a longest-first
  allocation. The report labels it `timed-lpt`. Balance is only an estimate until a
  measured warm run confirms it.
- A configured snapshot that is missing is an error, not a silent cold start.
- `npm ci` cache: `setup-node` caches npm. The first run is cold; later runs are warm.
  Compare setup times only between runs with the same `npm-cache-hit` value.

## Affected-tests trial (I)

`select-affected.mjs` diffs the merge-base of the base ref and HEAD (`--no-renames`, so a
rename counts as a deletion):

- **NO_SAMPLE:** only benchmark infrastructure changed. Nothing runs and nothing is measured.
- **FULL:** any deleted or renamed-away file; a broad input (`package*.json`, vitest/tsconfig/
  next config, `database.types.ts`, `fonts.ts`, `src/test-utils/**`, shared `__tests__` helpers);
  any non-module file under `apps/frontend` (json, sql, css, public, locales, ...); or any
  module outside `src/` and `__tests__/`. FULL runs the whole suite without coverage.
- **AFFECTED:** only module files under `src/` and `__tests__/` changed. Changed test files
  run directly. Changed non-test modules go to `vitest related`.

Static graph limits: dynamic imports with computed paths, `vi.mock` targets resolved from
strings, and runtime file reads are not seen. The report says so. Zero executed tests is
reported as NOT a speedup.

To get a meaningful sample, dispatch with `affected_base` set to a historical commit that
changed frontend modules. HEAD stays the source under test, so it matches the other variants.

## Run and re-run

1. Push to `bench/frontend-ci`. Run 1 is cold.
2. Run again (new commit or dispatch on the branch). Run 2 is the first warm run. Check
   that the shards say `timed-lpt` and that the snapshot key matches the report.
3. Repeat at least three warm runs before reading differences under about 10%.
4. Read the **Benchmark report and verification** job summary. Raw JSONL, JSON reports,
   LCOV, and plans are in `benchmark-*` artifacts (7-day retention).

Queue time is not measured. Read it from the Actions run page if needed.

## Versions

- Node 20 for every job (the build trial also runs on Node 20; Next.js supports >= 20.9).
- Vitest **3.2.7**: the lockfile resolves `^3.2.4` to 3.2.7. The benchmark uses the lockfile.
- TypeScript 5.9.x (lockfile).
- Bun **1.4.4** (`oven-sh/setup-bun`). `bun check` is documented at https://bun.com/docs/runtime/check.
- oxlint **1.94.0**, installed in `$RUNNER_TEMP`, not the frontend lockfile.

## What is NOT established

- Queue time and runner variance. One run is one sample.
- Balance quality of the timed partition until a warm run's shard timings are measured.
- Affected-test speedup on a real change, until a dispatched run with a historical base.
- `bun check` and oxlint correctness against `tsc` and ESLint. Only counts and exit status
  are compared.
- Production adoption. This is a measurement, not a recommendation.

## Rollback

Delete `.github/workflows/frontend-ci-benchmark.yml`, `scripts/ci-benchmark/`,
`apps/frontend/scripts/ci-benchmark/`, and the `bench/frontend-ci` branch. Nothing on `main` changes.
