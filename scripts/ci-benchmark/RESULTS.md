# Frontend CI benchmark: observed results (3 runs)

Experiment only. Nothing here is merged, deployed, or a recommendation to change production CI.
Every run used the same source commit, `90d7cd7e7afbd39625f03fc06856ec59a34dbefa`, on top of
`main` at `35d94217`. Trunk is excluded from both variants. Run dates are UTC (2026-11-19).

| Run | ID | Timing snapshot | npm cache | Affected trial |
| --- | --- | --- | --- | --- |
| 1 (cold) | [44429779047](https://github.com/Center-for-AI-Innovation/Illinois-Chat/actions/runs/44429779047) | none (native `--shard`) | mostly miss | not meaningful |
| 2 (warm) | [44430501511](https://github.com/Center-for-AI-Innovation/Illinois-Chat/actions/runs/44430501511) | from run 1 | hit | meaningful: 64 files, 771 tests |
| 3 (warm) | [44431057192](https://github.com/Center-for-AI-Innovation/Illinois-Chat/actions/runs/44431057192) | from run 2 (`frontend-ci-bench-timings-44430501511-1`) | hit | FULL, no coverage (control) |

Workflow status: all three runs have overall failure status because unmasked Oxlint diagnostics
exit 1 (existing backlog). Run 1 also had an unexpected strict coverage discrepancy (see below).
Do not describe any run as green.

## End-to-end: same run `createdAt` to job `completedAt`

Includes queueing, setup, artifact and post steps. This is NOT the workflow's total duration,
because the report job waits for every trial.

| Run | Baseline job (s) | Merged-coverage job (s) | Difference |
| --- | ---: | ---: | ---: |
| 1 (cold) | 290 | 262 | ~10% |
| 2 (warm) | 218 | 190 | ~13% |
| 3 (warm) | 231 | 173 | ~25% |

Setup and job handoffs materially reduce the apparent speedup. There is **no under-two-minute
end-to-end result**: warm full-suite sharded paths took 2m53s to 3m10s end to end.

## Command-only coverage path (test + check, excludes setup, queues, list)

| Run | Baseline (s) | Sharded: max of 4 shards + merge + verify + check (s) |
| --- | ---: | ---: |
| 1 | 188.476 | 75.310 |
| 2 | 162.310 | 72.330 |
| 3 | 172.735 | 58.252 |

These are per-step command times. They are not the critical path. The sharded column also omits
each shard's own `npm ci` and the merge job's `npm ci`, which run before the commands above.

## Parallel canonical path, runner seconds (proxy, not billing)

Covers resolve, canonical typecheck, four shards, and merge. It excludes experimental Bun, lint,
build, the affected trial, and report.

| Run | Sharded (runner s) | Baseline (runner s) | Ratio |
| --- | ---: | ---: | ---: |
| 1 | 772 | 287 | ~2.7x |
| 2 | 564 | 214 | ~2.6x |
| 3 | 510 | 226 | ~2.3x |

These are raw runner seconds, not exact billed minutes or pricing. Treat the ratio as a cost proxy only.

## Side trials (per-run step times, seconds)

| Trial | Run 1 | Run 2 | Run 3 | Notes |
| --- | ---: | ---: | ---: | --- |
| Canonical `tsc` (B) | 13.475 | 11.043 | 18.584 | Not on the critical path once it is its own job |
| `bun check` (C) | 0.875 | 0.507 | 0.626 | All pass. Benchmark-only tsconfig; TypeScript 7 checker vs. the repo's TypeScript 5.9 |
| Oxlint (D) | 0.426 | 0.421 | 0.424 | All exit 1: 826 diagnostics (664 errors, 162 warnings) |
| ESLint `npm run lint` (E) | 17.186 | 21.287 | 15.488 | All exit 0: 3926 warnings, 0 errors |
| Production build (H) | 100.006 | 97.485 | 147.487 | All pass. Not in the current PR baseline; no deployment |

- **Bun:** the passing result shows the benchmark config type-checks under the Bun checker. It does
  not establish semantic parity with `tsc`.
- **Oxlint vs. ESLint:** rule sets and severities differ, so the counts are not an apples-to-apples
  quality comparison. Blocking Oxlint cannot be adopted as-is.
- **Build:** each run's build passed on Node 20 with no secrets or dummy environment.

## Affected-tests trial

- **Run 2 (sample):** selected 64 files and 771 tests in 58.310 s. Selection was computed from
  `c24e6e4e619f68fafc1d72c12279765a9bc33d52` to HEAD (2 source files and 1 test changed). The tested
  source is the same as the full baseline.
- **Run 3 (control):** full suite without coverage, 327 files and 3051 tests in 138.490 s.
- Cross-run directional comparison: about 58% lower command time (58.310 vs 138.490 s). This is one
  historical diff and one control, not a controlled interval. Full coverage gates still run separately.
- Run 3 used a FULL fallback base (`0b43f6c5ebc32dbfe30b891a7c68e42509648bec`) only to trigger the
  FULL path. The tested source stayed `90d7cd7e`.

## Correctness and coverage

- **All 327 files and 3051 tests passed** in the baseline and in the shards, in all three runs.
  Unchanged coverage thresholds passed in both paths.
- **Strict full-LCOV equivalence:**
  - Run 1 failed on two lines in `BrandingForm.tsx` (232 and 246, the upload-success render). Baseline
    212/214 vs merged 214/214 covered. The shard-3 LCOV contains the hit, and the merged count equals
    the sum of the shard counts for all 551 files. Evidence points to a scheduling race in the existing
    upload test, which awaits the upload call but not the final render. Merge corruption is not supported.
  - Runs 2 and 3 passed strict per-file LF/LH and test-status comparison.
- The gate stays strict. Tests were not modified.

## Caveats

- Three runs is a small sample. One of the runs is a cold snapshot, so balance effects are not isolated.
- Duration balancing is not separated from cache state, runner variance, or the native first run. The
  warm-run difference cannot be attributed specifically to the timed (LPT) partition.
- Per-file timings exclude setup and collection time.
- The baseline and shard command times are not the same measurement. Setup and handoffs are excluded
  from the command-only table.

## Recommendations (for discussion only)

- The next bottleneck for sharding is scheduler, setup, and merge overhead, not the test commands.
  Each shard and the merge job pay for `npm ci`.
- Affected selection looks promising, but the coverage policy decision remains open: which runs must
  still produce coverage gates?
- Bun merits a compatibility evaluation before adoption. The passing trial does not establish
  semantic parity with `tsc`, and it required a benchmark-only tsconfig.
- Oxlint rule adoption should be a separate decision with its own backlog.

Nothing is merged or deployed. Normal workflows, configs, and the lockfile are untouched.
