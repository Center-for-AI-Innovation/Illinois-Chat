// Deterministic, timing-balanced shard allocation for the frontend test suite.
//
// Algorithm: longest-processing-time-first. Files are sorted by estimated
// duration (descending, then by path for a stable order) and each one goes to
// the currently least-loaded shard. Ties prefer the shard with fewer files,
// then the lower index, so every shard receives at least one file whenever
// there are at least as many files as shards.
//
// Files with no recorded timing (new tests) get the median of the known
// timings, so they are never dropped and never all piled onto one shard.
// With no timings at all, every file gets weight 1 (count-balanced only).
//
// Every shard job runs this same function over the same file list and the
// same timings snapshot, so each job independently computes the same partition.

/**
 * @typedef {{ file: string, durationMs?: number }} ShardItem
 * @typedef {{ files: string[], loadMs: number }} Bin
 */

/**
 * @param {ShardItem[]} items
 * @param {number} count
 * @returns {{ shards: string[][], loadsMs: number[], unknownFiles: string[] }}
 */
export function allocateShards(items, count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`shard count must be a positive integer, got ${count}`);
  }
  if (items.length < count) {
    throw new Error(
      `cannot split ${items.length} test files into ${count} non-empty shards`,
    );
  }
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.file)) {
      throw new Error(`duplicate test file in shard input: ${item.file}`);
    }
    seen.add(item.file);
  }

  /** @type {number[]} */
  const known = [];
  for (const item of items) {
    if (hasTiming(item.durationMs)) known.push(item.durationMs);
  }
  known.sort((a, b) => a - b);
  const fallbackMs = known.length ? median(known) : 1;

  /** @type {string[]} */
  const unknownFiles = [];
  /** @type {{ file: string, weight: number }[]} */
  const weighted = items.map((item) => {
    if (hasTiming(item.durationMs)) {
      return { file: item.file, weight: item.durationMs };
    }
    unknownFiles.push(item.file);
    return { file: item.file, weight: fallbackMs };
  });
  weighted.sort((a, b) =>
    b.weight !== a.weight ? b.weight - a.weight : compare(a.file, b.file),
  );

  /** @type {Bin[]} */
  const bins = Array.from({ length: count }, () => ({ files: [], loadMs: 0 }));
  for (const { file, weight } of weighted) {
    // Least-loaded bin; ties go to the bin with fewer files, then the lower index.
    let target = /** @type {Bin} */ (bins[0]);
    for (const bin of bins) {
      if (
        bin.loadMs < target.loadMs ||
        (bin.loadMs === target.loadMs && bin.files.length < target.files.length)
      ) {
        target = bin;
      }
    }
    target.files.push(file);
    target.loadMs += weight;
  }

  return {
    shards: bins.map((bin) => bin.files.sort(compare)),
    loadsMs: bins.map((bin) => Math.round(bin.loadMs)),
    unknownFiles: unknownFiles.sort(compare),
  };
}

/**
 * @param {number | undefined} d
 * @returns {d is number}
 */
function hasTiming(d) {
  return typeof d === "number" && Number.isFinite(d) && d > 0;
}

/**
 * @param {number[]} sorted
 * @returns {number}
 */
function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  const upper = /** @type {number} */ (sorted[mid]);
  if (sorted.length % 2) return upper;
  const lower = /** @type {number} */ (sorted[mid - 1]);
  return (lower + upper) / 2;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
