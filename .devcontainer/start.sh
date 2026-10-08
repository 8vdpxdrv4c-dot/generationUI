#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
run_dir="$PWD/.data/codespaces-demo"
mkdir -p "$run_dir"
if [ -f "$run_dir/launcher.pid" ] && kill -0 "$(cat "$run_dir/launcher.pid")" 2>/dev/null; then
  printf 'Generation UI is already running. Logs: %s\n' "$run_dir"
  exit 0
fi
nohup node .devcontainer/run.mjs >"$run_dir/launcher.log" 2>&1 &
echo "$!" >"$run_dir/launcher.pid"
printf 'Starting Next.js on 3000 and Python Agent on internal port 8123. Logs: %s\n' "$run_dir"
