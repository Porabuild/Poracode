#!/usr/bin/env bash
set -euo pipefail

# actions/setup-node installs the matching headers beside the active runtime.
# Point node-gyp there explicitly so native builds never download headers or
# SHASUMS from nodejs.org during every isolated CI job.
node_root="$(cd "$(dirname "$(command -v node)")/.." && pwd -P)"
node_header="$node_root/include/node/node.h"
if [[ ! -f "$node_header" ]]; then
  echo "::error::Active Node installation has no headers at $node_header"
  exit 1
fi
export npm_config_nodedir="$node_root"

for attempt in 1 2 3; do
  if pnpm rebuild node-pty; then
    exit 0
  fi
  if [[ "$attempt" -eq 3 ]]; then
    echo "::error::Native dependency rebuild failed after $attempt attempts."
    exit 1
  fi
  echo "::warning::Native dependency rebuild attempt $attempt failed; retrying."
  sleep $((attempt * 3))
done
