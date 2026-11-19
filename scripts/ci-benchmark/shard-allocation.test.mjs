// Run with: node --test scripts/ci-benchmark/
// Kept outside src/ and __tests__/ so the Vitest include globs never pick it up.
import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateShards } from "./shard-allocation.mjs";

/**
 * @param {number} n
 * @param {(i: number) => number | undefined} [timingFn]
 * @returns {{ file: string, durationMs?: number }[]}
 */
function files(n, timingFn = (i) => 1000 + i * 10) {
  return Array.from({ length: n }, (_, i) => ({
    file: `src/t/file-${String(i).padStart(3, "0")}.test.ts`,
    durationMs: timingFn(i),
  }));
}

/**
 * @param {{ file: string }[]} input
 * @param {{ shards: string[][] }} result
 */
function assertExactlyOnce(input, result) {
  const flat = result.shards.flat();
  assert.equal(flat.length, input.length, "every file assigned");
  assert.deepEqual(
    [...flat].sort(),
    input.map((i) => i.file).sort(),
    "each file exactly once",
  );
}

test("covers every file exactly once with known timings", () => {
  const input = files(331);
  const result = allocateShards(input, 4);
  assertExactlyOnce(input, result);
  assert.equal(result.shards.length, 4);
  assert.deepEqual(result.unknownFiles, []);
});

test("unknown timings are kept, not dropped, and spread across shards", () => {
  const input = files(40, (i) => (i % 3 === 0 ? undefined : 500 + i));
  const result = allocateShards(input, 4);
  assertExactlyOnce(input, result);
  assert.equal(
    result.unknownFiles.length,
    input.filter((i) => i.durationMs === undefined).length,
  );
  for (const shard of result.shards) assert.ok(shard.length > 0);
});

test("no timings at all still yields non-empty, count-balanced shards", () => {
  const input = files(10, () => undefined);
  const result = allocateShards(input, 4);
  assertExactlyOnce(input, result);
  const sizes = result.shards.map((s) => s.length).sort((a, b) => a - b);
  assert.deepEqual(sizes, [2, 2, 3, 3]);
});

test("zero or negative timings are treated as unknown, not as free work", () => {
  const input = files(8, (i) => (i < 2 ? 0 : 100));
  const result = allocateShards(input, 4);
  assertExactlyOnce(input, result);
  assert.deepEqual(result.unknownFiles.length, 2);
  for (const shard of result.shards) assert.ok(shard.length > 0);
});

test("is deterministic regardless of input order", () => {
  const input = files(50, (i) => ((i * 37) % 900) + 100);
  const shuffled = [...input].reverse();
  const a = allocateShards(input, 4);
  const b = allocateShards(shuffled, 4);
  assert.deepEqual(a.shards, b.shards);
  assert.deepEqual(a.loadsMs, b.loadsMs);
});

test("balances known durations well (max load within one max-item of mean)", () => {
  const input = files(331, (i) => 200 + ((i * 7919) % 5000));
  const result = allocateShards(input, 4);
  const durations = input.map((i) => i.durationMs ?? 0);
  const mean = durations.reduce((s, d) => s + d, 0) / 4;
  const maxItem = Math.max(...durations);
  assert.ok(Math.max(...result.loadsMs) - mean <= maxItem);
});

test("refuses to create empty shards", () => {
  assert.throws(() => allocateShards(files(3), 4), /non-empty shards/);
});

test("refuses duplicate file paths instead of double-running them", () => {
  const input = [
    { file: "a.test.ts", durationMs: 1 },
    { file: "a.test.ts", durationMs: 1 },
  ];
  assert.throws(() => allocateShards(input, 1), /duplicate/);
});

test("rejects invalid shard counts", () => {
  assert.throws(() => allocateShards(files(3), 0), /positive integer/);
  assert.throws(() => allocateShards(files(3), 1.5), /positive integer/);
});
