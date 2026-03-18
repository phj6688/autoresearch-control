# Autoresearch Mission Control

Self-hosted web UI for managing multiple concurrent [autoresearch](https://github.com/karpathy/autoresearch) sessions. Monitor experiments, compare metrics, track GPU usage, and chat with an AI assistant that understands your entire research context.

## What It Does

Mission Control orchestrates autonomous AI research agents running in tmux sessions. Each session has its own git worktree, GPU assignment, and experiment loop. The dashboard shows everything in real time via SSE.

**Dashboard views:**
- **Sessions** — live status, metrics, sparklines, experiment timeline, commit feed, code heatmap
- **Analytics** — session health overview, restart counts, healthy/unhealthy status
- **Events** — global event log with session and type filters
- **Compare** — side-by-side session comparison with sortable columns

**AI Assistant** — a chat drawer (toggle with the "Assistant" button) that can answer questions about any session, explain experiments in plain language, show live agent activity, and help write new session strategies. Powered by Claude via the Anthropic API.

**Toast notifications** — experiment completion alerts that auto-dismiss and navigate to the relevant session on click.

## Architecture

```
Browser → Next.js 15 (SSR + API) → SQLite (WAL mode)
                                      ↓
                                tmux sessions → Claude Code / Codex / Aider / Gemini CLI
                                      ↓
                                git worktrees → code modifications
                                      ↓
                                results.tsv → fs.watch → SSE → Browser
                                      ↓
                                nvidia-smi → GPU status → Browser
```

## Prerequisites

- **Node.js** 22+ (`node --version`)
- **pnpm** 9+ (`pnpm --version`)
- **tmux** (`tmux -V`)
- **git** (`git --version`)
- **Docker + Docker Compose** (for containerized deployment)
- **Claude Code CLI** (for running agents: `claude --version`)
- GPU with `nvidia-smi` or AMD ROCm (optional — UI works without one)

## Quick Start

### Local Development

```bash
# Clone and install
git clone git@github.com:phj6688/autoresearch-control.git autoresearch-control
cd autoresearch-control
pnpm install

# Configure environment
cp .env.example .env
# Edit .env — set AUTORESEARCH_REPO_PATH, AUTORESEARCH_WORKTREE_DIR, ANTHROPIC_API_KEY

# Run dev server (port 3200)
pnpm dev
```

Open `http://localhost:3200/proxy/autoresearch`

### Docker (Production)

```bash
# Build and run
docker compose up -d --build --force-recreate

# Verify
curl http://localhost:3200/proxy/autoresearch/api/health
```

Never use `docker compose restart` — it uses stale images. Always `docker compose up -d --build --force-recreate`.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server on `:3200` |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm typecheck` | Run `tsc --noEmit` |
| `pnpm lint` | Run ESLint |

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTORESEARCH_REPO_PATH` | Path to cloned autoresearch repo | `/home/user/autoresearch` |
| `AUTORESEARCH_WORKTREE_DIR` | Directory for git worktrees | `/home/user/autoresearch-runs` |
| `ANTHROPIC_API_KEY` | Anthropic API key (for AI assistant) | `sk-ant-...` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3200` | Server port |
| `HOSTNAME` | `0.0.0.0` | Bind address |
| `DEFAULT_AGENT` | `claude-code` | Default agent type for new sessions |
| `DEFAULT_AGENT_COMMAND` | `claude --model claude-opus-4-6` | Command to spawn agents |
| `ASSISTANT_MODEL` | `claude-sonnet-4-20250514` | Claude model for the chat assistant |
| `TELEGRAM_BOT_TOKEN` | _(empty)_ | Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | _(empty)_ | Telegram chat ID for alerts |

## Folder Structure

```
autoresearch-control/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── api/
│   │   │   ├── chat/               # AI assistant endpoints
│   │   │   │   ├── route.ts        #   POST — streaming chat with Claude
│   │   │   │   └── conversations/  #   GET/DELETE conversation history
│   │   │   ├── sessions/           # Session CRUD + actions
│   │   │   │   ├── route.ts        #   GET list, POST create
│   │   │   │   └── [id]/           #   PATCH actions, DELETE, experiments, events, activity, fork
│   │   │   ├── stream/             # SSE endpoint (real-time updates)
│   │   │   ├── gpus/               # GPU status
│   │   │   ├── health/             # Health check + detailed status
│   │   │   └── events/             # Global event log
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Dashboard entry
│   │   └── globals.css             # Theme CSS variables
│   ├── components/
│   │   ├── dashboard.tsx           # Main layout — header, tabs, stats, sidebar, content
│   │   ├── session-list.tsx        # Sidebar session cards + GPU bar
│   │   ├── session-detail.tsx      # Session view — metrics, timeline, actions
│   │   ├── session-card.tsx        # Mini session card with sparkline
│   │   ├── chat-drawer.tsx         # AI assistant slide-out panel
│   │   ├── chat-message.tsx        # Chat message bubble
│   │   ├── toast-container.tsx     # Experiment completion notifications
│   │   ├── new-session-modal.tsx   # Create/fork session form
│   │   ├── experiment-timeline.tsx # D3 experiment chart
│   │   ├── comparison-view.tsx     # Multi-session comparison table
│   │   ├── analytics-view.tsx      # Session health dashboard
│   │   ├── events-view.tsx         # Global event log with filters
│   │   ├── activity-panel.tsx      # Live activity status + event feed
│   │   ├── tab-navigation.tsx      # Sessions/Analytics/Events/Compare tabs
│   │   └── error-boundary.tsx      # Error boundary wrapper
│   ├── hooks/
│   │   ├── use-sse.ts              # SSE connection + event dispatch
│   │   ├── use-chat.ts             # Chat message state + POST SSE stream parsing
│   │   ├── use-activity-poll.ts    # Activity polling for running sessions
│   │   └── use-gpu-poll.ts         # GPU status polling
│   ├── lib/
│   │   ├── db.ts                   # SQLite singleton, schema, CRUD operations
│   │   ├── chat-db.ts              # Chat conversation + message operations
│   │   ├── chat-context.ts         # Tiered context assembly for AI assistant
│   │   ├── session-lifecycle.ts    # Create/pause/resume/kill sessions via tmux
│   │   ├── process-manager.ts      # tmux process management
│   │   ├── git.ts                  # Git worktree operations with mutex locks
│   │   ├── gpu.ts                  # nvidia-smi / ROCm GPU detection
│   │   ├── watcher.ts              # results.tsv file watcher per session
│   │   ├── health-agent.ts         # Background health checker (30s interval)
│   │   ├── sse-broker.ts           # SSE pub/sub with 15s heartbeat
│   │   ├── activity-parser.ts      # tmux output → activity status
│   │   ├── results-parser.ts       # results.tsv → experiment records
│   │   ├── base-path.ts            # basePath utility for fetch URLs
│   │   ├── types.ts                # Shared TypeScript types
│   │   └── metric-utils.ts         # Metric formatting + comparison
│   └── stores/
│       ├── session-store.ts        # Zustand — sessions, selection, GPUs, view
│       ├── chat-store.ts           # Zustand — drawer state, toasts
│       └── events-store.ts         # Zustand — global events
├── data/                           # SQLite database (auto-created)
├── maestro/                        # E2E browser tests
│   ├── flows/                      #   YAML test flows
│   └── run.sh                      #   Test runner (headless Chrome via Xvfb)
├── docs/                           # Design specs and implementation plans
├── docker-compose.yml              # Container orchestration (host networking)
├── Dockerfile                      # Multi-stage build (node:22-bookworm)
├── next.config.ts                  # basePath: /proxy/autoresearch, standalone output
├── CLAUDE.md                       # Agent coding rules
└── TASKSPEC.md                     # Original specification
```

## API Routes

### Sessions
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create new session |
| `PATCH` | `/api/sessions/[id]` | Session action (pause/resume/restart/kill) |
| `DELETE` | `/api/sessions/[id]` | Delete session |
| `GET` | `/api/sessions/[id]/experiments` | List experiments |
| `GET` | `/api/sessions/[id]/events` | Session event history |
| `GET` | `/api/sessions/[id]/activity` | Live activity snapshot |
| `POST` | `/api/sessions/[id]/fork` | Fork session |

### Chat (AI Assistant)
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/chat` | Send message, get streaming response |
| `GET` | `/api/chat/conversations` | List conversations |
| `GET` | `/api/chat/conversations/[id]` | Get conversation messages |
| `DELETE` | `/api/chat/conversations/[id]` | Delete conversation |

### System
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/gpus` | GPU status |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/health/status` | Detailed health status |
| `GET` | `/api/events` | Global event log |
| `GET` | `/api/stream` | SSE real-time updates |

All API routes are prefixed with the basePath: `/proxy/autoresearch/api/...`

## E2E Tests

Maestro YAML-based browser tests run against the live app:

```bash
# Run all tests
./maestro/run.sh

# Run a single test
./maestro/run.sh maestro/flows/01-app-loads.yaml
```

Requires Java (`~/.local/jdk`) and Maestro CLI (`~/.maestro/bin`). Uses headless Chrome via Xvfb.

## License

Private — not open source.
