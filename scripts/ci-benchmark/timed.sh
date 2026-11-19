#!/usr/bin/env bash
# Runs one benchmark step and appends its wall time to $BENCH_STEPS_FILE (JSONL).
# Usage: timed.sh <label> <command> [args...]
# The command's exit status is returned unchanged; this wrapper never masks a failure.
set -uo pipefail

label="$1"
shift
out="${BENCH_STEPS_FILE:?BENCH_STEPS_FILE must be set}"

now_ms() {
  local t
  t=$(date +%s%3N 2>/dev/null)
  if [[ "$t" =~ ^[0-9]+$ ]]; then
    echo "$t"
  else
    # macOS date has no %3N; fall back for local runs.
    python3 -c 'import time; print(int(time.time() * 1000))'
  fi
}

start=$(now_ms)
"$@"
rc=$?
end=$(now_ms)

mkdir -p "$(dirname "$out")"
printf '{"label":"%s","durationMs":%d,"exitCode":%d}\n' "$label" "$((end - start))" "$rc" >> "$out"
exit "$rc"
