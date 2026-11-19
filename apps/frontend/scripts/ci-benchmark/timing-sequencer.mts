// Benchmark-only Vitest sequencer. Overrides shard() only; sort() is inherited.
// With BENCH_TIMINGS_FILE set (an immutable snapshot from build-timings.mjs):
// timed LPT partition. Without it: Vitest's native hash-based --shard (not balanced).
// Every shard computes the same partition from the same snapshot.
import fs from 'node:fs'
import path from 'node:path'
import { BaseSequencer, type TestSpecification } from 'vitest/node'
// Repo-root helper (outside apps/frontend, so canonical tsconfig never sees it).
import { allocateShards } from '../../../../scripts/ci-benchmark/shard-allocation.mjs'

interface Timings {
  files?: Record<string, number>
}

export default class TimingSequencer extends BaseSequencer {
  async shard(specs: TestSpecification[]): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config
    if (!shard) throw new Error('TimingSequencer.shard() requires --shard')
    const who = { shard: shard.index, count: shard.count }
    const timings = readTimings(process.env.BENCH_TIMINGS_FILE)

    if (!timings) {
      const native = await super.shard(specs)
      writePlan({
        mode: 'native-hash (cold start, not time-balanced)',
        files: native.map((spec) => relativeTo(root, spec.moduleId)),
      })
      return native
    }

    const items = specs.map((spec) => ({
      spec,
      file: relativeTo(root, spec.moduleId),
    }))
    const { shards, loadsMs, unknownFiles } = allocateShards(
      items.map(({ file }) => ({ file, durationMs: timings[file] })),
      shard.count,
    )
    const mine = new Set(shards[shard.index - 1])
    writePlan({
      mode: 'timed-lpt',
      estimatedLoadMs: loadsMs[shard.index - 1],
      allEstimatedLoadsMs: loadsMs,
      unknownFiles,
      files: [...mine],
    })
    return items.filter(({ file }) => mine.has(file)).map(({ spec }) => spec)

    function writePlan(body: Record<string, unknown>) {
      const file = process.env.BENCH_PLAN_FILE
      if (!file) return
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(
        file,
        JSON.stringify({ ...who, ...body }, null, 2) + '\n',
      )
    }
  }
}

function relativeTo(root: string, moduleId: string): string {
  return path.relative(root, moduleId).split(path.sep).join('/')
}

function readTimings(file: string | undefined): Record<string, number> | null {
  if (!file) return null
  // An explicitly configured snapshot that is missing is an error, not a silent cold start.
  if (!fs.existsSync(file))
    throw new Error(`BENCH_TIMINGS_FILE set but missing: ${file}`)
  const files = (JSON.parse(fs.readFileSync(file, 'utf8')) as Timings).files
  return files && Object.keys(files).length > 0 ? files : null
}
