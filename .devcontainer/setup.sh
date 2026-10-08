#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"

python3 -m pip install --user uv
npx --yes pnpm@9.0.0 install --frozen-lockfile
npx --yes pnpm@9.0.0 --filter @repo/design-system build
(cd apps/agent && uv sync --frozen --no-dev --python 3.12.11)
(
  cd apps/app
  node scripts/prepare-three-modules.mjs
  node node_modules/next/dist/bin/next build --webpack
  node scripts/prepare-standalone.mjs
)
