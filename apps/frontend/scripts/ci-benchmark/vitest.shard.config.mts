// Benchmark-only Vitest config for the sharded CI variant. It extends the canonical
// vitest.config.mts unchanged (same environment, setup file, includes, coverage
// settings and excludes) and only swaps in the timing-aware sequencer.
// The canonical config is not modified and is still what `npm run test:coverage`
// uses.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from '../../vitest.config.mts'
import TimingSequencer from './timing-sequencer.mts'

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: frontendRoot,
    test: {
      sequence: {
        sequencer: TimingSequencer,
      },
    },
  }),
)
