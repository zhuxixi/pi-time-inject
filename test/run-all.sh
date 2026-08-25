#!/usr/bin/env bash
# Run all extension tests: esbuild bundle each test/*.test.ts to a temp file,
# then execute with node. Zero-dependency — no test framework, no package.json.
# Exits non-zero if any test file fails.
set -euo pipefail

cd "$(dirname "$0")/.."

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

total=0
failed_count=0
failed_files=()

for t in test/*.test.ts; do
  total=$((total + 1))
  name="$(basename "$t" .ts)"
  out="$tmpdir/$name.mjs"
  echo "=== $t ==="
  if ! npx esbuild "$t" --bundle --format=esm --platform=node --outfile="$out" --log-level=warning; then
    echo "BUNDLE-FAIL $t"
    failed_count=$((failed_count + 1))
    failed_files+=("$t (bundle)")
    continue
  fi
  if node "$out"; then
    :
  else
    failed_count=$((failed_count + 1))
    failed_files+=("$t")
  fi
  echo
done

passed=$((total - failed_count))
if [ "$failed_count" -gt 0 ]; then
  echo "FAILED: ${passed}/${total} test files passed"
  printf '  - %s\n' "${failed_files[@]}"
  exit 1
fi
echo "OK: ${passed}/${total} test files passed"
