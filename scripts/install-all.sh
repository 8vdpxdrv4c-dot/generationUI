#!/bin/sh
# Install everything the single-port launcher needs:
#   - the pnpm workspace dependencies (+ the design-system build the app imports)
#   - the Python agent's dependencies in a CPython >= 3.12 venv
#
# The two halves are independent, so they run in parallel — a serial run
# overruns the deploy sandbox's 300s install budget. `next build` is NOT run
# here for the same reason; the launcher builds once at boot instead.
# Verbose output goes to per-half log files; only banners and a short failure
# tail reach stdout.
#
# Env overrides:
#   PYTHON_BIN    interpreter to build the agent venv from (skips detection)
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

NODE_LOG="$ROOT/.install-node.log"
AGENT_LOG="$ROOT/.install-agent.log"

log() { printf '[install] %s\n' "$*"; }
step() { printf '\n[install] ===== %s =====\n' "$*"; }

fail_with_log() {
  printf '\n[install] FAILED: %s\n' "$1" >&2
  printf '[install] --- tail of %s ---\n' "$2" >&2
  tail -n 15 "$2" >&2
  exit 1
}

export npm_config_update_notifier=false
export npm_config_fund=false
export npm_config_audit=false
export npm_config_loglevel=error

# ── 1. pnpm ──────────────────────────────────────────────────────────────────
# corepack's shim fails in some sandboxes ("Cannot find matching keyid") when it
# tries to fetch pnpm, so install pnpm with npm directly and take the corepack
# shim back out of the way.
step '1/4 pnpm'
export COREPACK_INTEGRITY_KEYS=0
if command -v corepack >/dev/null 2>&1; then
  corepack disable >/dev/null 2>&1 || true
fi

if ! command -v pnpm >/dev/null 2>&1; then
  log 'installing pnpm@9 via npm'
  npm install -g pnpm@9.0.0 >"$NODE_LOG" 2>&1 || fail_with_log 'npm install -g pnpm' "$NODE_LOG"
fi
command -v pnpm >/dev/null 2>&1 || fail_with_log 'pnpm is not on PATH after install' "$NODE_LOG"
log "node $(node -v 2>/dev/null || echo '?') / pnpm $(pnpm --version)"

# ── 2. CPython >= 3.12 ───────────────────────────────────────────────────────
# The sandbox's default can be older than the agent needs (its pyenv global was
# 3.11), and pyenv shims also fail on apps/agent/.python-version when that
# version is not installed. Pick a real >= 3.12 interpreter by absolute path.
is_py312() {
  [ -x "$1" ] && "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' >/dev/null 2>&1
}

collect_candidates() {
  if [ -n "${PYTHON_BIN:-}" ]; then printf '%s\n' "$PYTHON_BIN"; fi
  for candidate in \
    /usr/bin/python3.12 /usr/bin/python3.13 /usr/bin/python3.14 \
    /usr/bin/python3 /usr/local/bin/python3.12 /usr/local/bin/python3; do
    printf '%s\n' "$candidate"
  done
  for root in "${PYENV_ROOT:-$HOME/.pyenv}" /root/.pyenv; do
    [ -d "$root/versions" ] || continue
    for version in $(ls -1 "$root/versions" 2>/dev/null | sort -rV); do
      printf '%s\n' "$root/versions/$version/bin/python3"
    done
  done
  command -v python3 2>/dev/null || true
  command -v python 2>/dev/null || true
}

step '2/4 python >= 3.12'
log 'candidates:'
collect_candidates | while read -r candidate; do
  [ -n "$candidate" ] || continue
  [ -x "$candidate" ] || continue
  printf '[install]   %s -> %s\n' "$candidate" "$("$candidate" -V 2>&1 || echo unusable)"
done

set -- $(collect_candidates)
PY=""
for candidate in "$@"; do
  [ -n "$candidate" ] || continue
  if is_py312 "$candidate"; then
    PY="$candidate"
    break
  fi
done

if [ -z "$PY" ]; then
  BASE=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)
  [ -n "$BASE" ] || fail_with_log 'no python interpreter at all' "$AGENT_LOG"

  log "no CPython >= 3.12 found; downloading one with uv (base: $BASE)"
  if ! command -v uv >/dev/null 2>&1; then
    "$BASE" -m pip install --disable-pip-version-check --no-input uv \
      >"$AGENT_LOG" 2>&1 || fail_with_log 'install uv' "$AGENT_LOG"
  fi
  uv python install 3.12 >>"$AGENT_LOG" 2>&1 || fail_with_log 'uv python install 3.12' "$AGENT_LOG"
  PY=$(uv python find 3.12)
fi
is_py312 "$PY" || fail_with_log "resolved interpreter is not >= 3.12: $PY" "$AGENT_LOG"
log "python: $PY ($("$PY" -V 2>&1))"

# The agent reads its key from apps/agent/.env via python-dotenv. Report the
# state (never the value) so a missing key is visible in the install log.
if [ -f "$ROOT/apps/agent/.env" ]; then
  if grep -q '^DEEPSEEK_API_KEY=.\+' "$ROOT/apps/agent/.env"; then
    log 'agent .env: present, DEEPSEEK_API_KEY set'
  else
    log 'agent .env: present but DEEPSEEK_API_KEY is empty'
  fi
else
  log 'agent .env: MISSING — the agent will fail to boot without an API key'
fi

# ── 3. Web build and agent deps, in parallel ─────────────────────────────────
step '3/4 web deps + agent deps (parallel)'
: > "$NODE_LOG"
: > "$AGENT_LOG"

build_web() {
  set -e
  printf '[web] start %s\n' "$(date -u +%H:%M:%S)"
  pnpm install --no-frozen-lockfile
  printf '[web] pnpm install done %s\n' "$(date -u +%H:%M:%S)"
  # Build explicitly instead of running @repo/app's `build` script: that script
  # shells out to pnpm again, which is not guaranteed to be on PATH.
  pnpm --filter @repo/design-system build
  printf '[web] design-system built %s\n' "$(date -u +%H:%M:%S)"
  cd apps/app
  node scripts/prepare-three-modules.mjs
  printf '[web] three modules ready %s\n' "$(date -u +%H:%M:%S)"

  # No `next build` here: it does not fit the sandbox's 300s install budget, so
  # the launcher runs it once at boot instead and then serves with `next start`.
  # Any existing `.next` is kept — the launcher drops it itself when the source
  # fingerprint changed, which is the only case where it can be stale.
  printf '[web] deps ready %s\n' "$(date -u +%H:%M:%S)"
}

install_agent_deps() {
  set -e
  printf '[agent] start %s\n' "$(date -u +%H:%M:%S)"
  # A venv of its own: the sandbox's system Python is PEP 668
  # externally-managed, so a bare `pip install` is refused.
  VENV_DIR="$ROOT/apps/agent/.venv-deploy"
  rm -rf "$VENV_DIR" || true

  if command -v uv >/dev/null 2>&1; then
    uv venv --python "$PY" "$VENV_DIR"
    VENV_PY="$VENV_DIR/bin/python"
    [ -x "$VENV_PY" ] || {
      echo "uv venv did not produce $VENV_PY"
      exit 1
    }
    uv pip install --python "$VENV_PY" -r "$ROOT/apps/agent/requirements-lock.txt"
  else
    "$PY" -m venv "$VENV_DIR"
    VENV_PY="$VENV_DIR/bin/python"
    "$VENV_PY" -m pip install --disable-pip-version-check --no-input \
      -r "$ROOT/apps/agent/requirements-lock.txt"
  fi

  printf '%s\n' "$VENV_PY" > "$ROOT/.deploy-python"
  "$VENV_PY" -c 'import uvicorn, fastapi, langgraph; print("agent deps ok")'
  printf '[agent] done %s\n' "$(date -u +%H:%M:%S)"
}

build_web >"$NODE_LOG" 2>&1 &
NODE_PID=$!

install_agent_deps >"$AGENT_LOG" 2>&1 &
AGENT_PID=$!

NODE_RC=0
AGENT_RC=0
wait "$NODE_PID" || NODE_RC=$?
wait "$AGENT_PID" || AGENT_RC=$?

# ── 4. Verify ────────────────────────────────────────────────────────────────
step '4/4 verify'
[ "$NODE_RC" = "0" ] || fail_with_log 'web deps / build' "$NODE_LOG"
[ "$AGENT_RC" = "0" ] || fail_with_log 'agent dependencies' "$AGENT_LOG"
[ -f "$ROOT/.deploy-python" ] || fail_with_log 'python runtime was not recorded' "$AGENT_LOG"
# `.next` is intentionally absent when the build is skipped, so check that the
# Next package itself is installed instead.
[ -d "$ROOT/apps/app/node_modules/next" ] || fail_with_log 'web dependencies are incomplete' "$NODE_LOG"
[ -d "$ROOT/apps/app/public/vendor/three" ] || fail_with_log 'three.js modules were not prepared' "$NODE_LOG"

log "agent runtime: $(cat "$ROOT/.deploy-python")"
log 'install complete.'
