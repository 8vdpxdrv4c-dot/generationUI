# Deployment

## GitHub Codespaces demo

The `.devcontainer` configuration runs the complete Next.js app and Python Agent
in one Codespace with Node 22 and Python 3.12. Use a 2-core machine to conserve
the personal account's included compute quota. Codespaces is for development
and demonstrations: idle timeouts and quota limits can stop the demo.

1. Create a Codespace from your repository's `main` branch. Set the recommended
   `DEEPSEEK_API_KEY` secret for this repository to enable AI generation.
2. Wait for dependency installation and the production Next.js build. Startup
   launches Next.js on port 3000 and the Agent on loopback port 8123.
3. In the **Ports** panel, set port **3000** to **Public**, then copy its HTTPS
   forwarded address. Keep port 8123 private. Only share a fresh demo without
   private uploads or conversations: the application has no user accounts.
4. Stop the Codespace when the demonstration ends to conserve compute time.

On subsequent starts, the processes launch automatically without rebuilding.
To rebuild after source changes, stop the launcher and its children, run
`bash .devcontainer/setup.sh`, then `bash .devcontainer/start.sh`.
Logs are in `.data/codespaces-demo/`. If a model secret was added or changed,
stop and restart the Codespace to load it. Without a key, the website starts
but AI generation is unavailable. Secrets are never bundled into browser code.
Saved history and uploads live in `/workspaces/.../.data` and survive stop/start;
deleting the Codespace deletes that data. Temporary agent checkpoints reset
when its process restarts. Model API charges are separate from hosting quotas.

## Render

The project includes a `render.yaml` for one-click deployment to [Render](https://render.com/).

### Services

**Agent** (private Python service):
- Runtime: Python 3.12.11
- Build: `pip install uv && uv sync --frozen --no-dev`
- Start: `.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8123`
- Internal health endpoint: `GET /health`
- Root directory: `apps/agent`

**Frontend** (Node):
- Runtime: Node 22
- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm exec turbo run build --filter=@repo/app`
- Start: `node apps/app/.next/standalone/apps/app/server.js`
- Health check: `GET /api/health`
- Root directory: (repo root)

### Environment Variables

| Variable | Service | Required | Notes |
|----------|---------|----------|-------|
| `DEEPSEEK_API_KEY` | Agent | Yes | Set as a Render secret; never commit it |
| `DEEPSEEK_BASE_URL` | Agent | No | Blueprint defaults to `https://api.deepseek.com` |
| `LLM_MODEL` | Agent | No | Blueprint uses `deepseek-chat`, matching the local agent |
| `LANGGRAPH_DEPLOYMENT_URL` | Frontend | Auto | Injected from agent service via `fromService` |
| `HISTORY_DATA_DIR` | Frontend | Auto | `/var/data/history` on the persistent disk |
| `UPLOAD_DATA_DIR` | Frontend | Auto | `/var/data/uploads` on the persistent disk |

To use a different model provider, change `LLM_MODEL` and configure its required
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the Agent's Render environment.

### Storage and instances

Both services run one instance in Singapore. The frontend has a 1 GB persistent
disk at `/var/data` for saved pages, conversation history, and uploads. Uploads
are served through `/upload/[filename]`, including files added after deployment.
The standalone build copies static resources and excludes local uploads.

Keep the frontend at one instance while it uses file-based storage. The Agent's
live checkpoints and temporary view links are in memory; they reset on restart.
Saved history remains on the frontend disk. Render compute and disks are paid
resources; check the final cost in the deployment form before provisioning.

### Deploy

1. Push the current local source to your own GitHub repository, preserving the
   workspace packages, `patches/`, and local public resource files. Do not deploy
   the unchanged upstream repository. Exclude `.env` files, local `.data` history,
   `public/upload` content, `node_modules`, `_verify`, and local backups.
2. Create a new **Blueprint** on Render
3. Connect your forked repo
4. Add `DEEPSEEK_API_KEY` as a secret
5. Deploy

Render reads `render.yaml` and creates both services. The frontend automatically
gets the private Agent URL via service discovery. Verify `/api/health`, open the
home page, and submit a generation request after deployment. Local saved pages
are not automatically migrated to the new persistent disk.

## General Deployment

For other platforms, you need to deploy two services:

### 1. Agent (Python)

```bash
cd apps/agent
pip install uv
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8123
```

Requirements:
- Python 3.12+
- `ANTHROPIC_API_KEY` environment variable
- Port exposed for the frontend to reach

### 2. Frontend (Node)

```bash
# From repo root
corepack enable
pnpm install
pnpm --filter @repo/app build
LANGGRAPH_DEPLOYMENT_URL=http://your-agent-host:8123 pnpm --filter @repo/app start
```

Requirements:
- Node 22+
- `LANGGRAPH_DEPLOYMENT_URL` pointing to the agent service
- Port 3000 exposed

### Health Checks

| Service | Endpoint | Expected |
|---------|----------|----------|
| Agent | `GET /health` | `{"status": "ok"}` |
| Frontend | `GET /api/health` | 200 OK |

## Docker

A Dockerfile for the frontend is available at `docker/Dockerfile.app`. The agent can be containerized with a standard Python Dockerfile using `uv`.

## Next Steps

- [Getting Started](getting-started.md) — Local development setup
- [Architecture](architecture.md) — Understand the service topology
