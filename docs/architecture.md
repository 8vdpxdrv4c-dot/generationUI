# Architecture

## Monorepo Structure

This is a Turborepo monorepo with two apps:

```
apps/
├── app/        Next.js 16 frontend (React 19, TailwindCSS 4)
└── agent/      Python LangGraph agent (FastAPI, OpenAI)
```

The frontend is managed by pnpm workspaces. The Python agent is managed separately with `uv`.

## Request Flow

```
Browser
  │
  ▼
Next.js App (:3000)
  │
  ├── /api/copilotkit       ← CopilotKit API route
  │     │
  │     ▼
  │   CopilotRuntime
  │     │
  │     ▼
  │   LangGraphHttpAgent ──→ FastAPI Agent (:8123)
  │                            │
  │                            ├── LangGraph tools
  │                            ├── CopilotKitMiddleware
  │                            └── State management
  │
  └── React UI
        │
        ├── useAgent()          ← Read/write agent state
        ├── useComponent()      ← Register generative UI
        ├── useFrontendTool()   ← Agent-callable frontend actions
        └── useHumanInTheLoop() ← Interactive prompts
```

## Key Files

### Frontend (`apps/app/`)

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Wraps the app with `<CopilotKit>` and `<ThemeProvider>` |
| `src/app/page.tsx` | Main page — chat UI, demo gallery, background |
| `src/app/api/copilotkit/route.ts` | Connects CopilotKit runtime to the LangGraph agent |
| `src/hooks/use-generative-ui-examples.tsx` | Registers all generative UI components |
| `src/hooks/use-example-suggestions.tsx` | Chat suggestion prompts |
| `src/components/generative-ui/` | Chart, widget, and interactive components |

### Agent (`apps/agent/`)

| File | Purpose |
|------|---------|
| `main.py` | Agent definition, FastAPI app, system prompt |
| `src/todos.py` | `AgentState` schema and todo tools |
| `src/query.py` | Sample data query tool |
| `src/plan.py` | Visualization planning tool |
| `src/form.py` | Form generation tool (AG-UI) |
| `src/bounded_memory_saver.py` | Memory-capped checkpointer |
| `skills/` | Skill documents loaded at startup |

## State Sync

State flows bidirectionally between the agent and frontend via CopilotKit:

```
Frontend                          Agent
────────                          ─────
agent.state.todos    ◄────────    AgentState.todos
agent.setState(...)  ────────►    Command(update={...})
```

Both the user (via React UI) and the agent (via tools) can modify the same state. CopilotKit handles synchronization automatically. See [Agent State](agent-state.md) for details.
