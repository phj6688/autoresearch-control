# AUTORESEARCH MISSION CONTROL — TASK SPEC

## Provenance
- Spec written: 2026-03-13
- Codebase state: greenfield
- Audit performed: n/a — greenfield (Risk Speculation Report in AUDIT.md)
- Orchestrator: Claude Chat (FORGE protocol)
- Reference repo: https://github.com/karpathy/autoresearch

## Mission

Build a self-hosted web UI ("Mission Control") that manages multiple concurrent Karpathy autoresearch sessions. Each session is an independent AI agent (Claude Code, Codex, Aider, etc.) autonomously modifying `train.py` in a git worktree, training for 5-minute windows, and accumulating commits on its own branch. The UI provides: session lifecycle management (create, pause, resume, kill, fork), real-time experiment telemetry from `results.tsv` and git log, multi-session comparison charts, GPU scheduling, and Telegram alerts on breakthroughs.

Target deployment: Docker container on Peyman's Pop!_OS homelab (Tailscale 100.115.215.121), proxied through Apps Gateway at `apps.peyman.io/proxy/autoresearch/`.

## Stack (non-negotiable)

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Runtime | Node.js | 22 LTS | Matches homelab ecosystem |
| Framework | Next.js | 15+ (App Router) | SSR + API routes in one process, consistent with Cortex V3 |
| Styling | Tailwind CSS | 4 | Consistent with Cortex V3 |
| State | Zustand | 5+ | Lightweight, no boilerplate |
| Charts | D3 (via SVG) | 7 | Full control over research visualizations, no chart library abstraction |
| Database | better-sqlite3 | latest | Session metadata persistence, zero ops |
| Process Mgmt | node-pty + tmux | — | Spawn and manage agent processes |
| Real-time | Server-Sent Events (SSE) | — | Unidirectional push from server, simpler than WebSocket |
| Git | simple-git | latest | Git worktree + branch management |
| Package Mgr | pnpm | 9+ | — |
| Container | Docker + docker-compose | — | Single-container deployment |

**Explicitly NOT using:** tRPC (overkill for this), Prisma (SQLite is direct), recharts/chart.js (D3 for full control), WebSocket (SSE is sufficient).

## Directory Structure

```
autoresearch-control/
├── TASKSPEC.md
├── AUDIT.md
├── CLAUDE.md
├── .claude/
│   └── settings.local.json
├── sessions/                          # FORGE session prompts
│   ├── session-1-prompt.md
│   ├── session-2-prompt.md
│   └── ...
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .env
├── public/
│   └── fonts/
│       └── JetBrainsMono-*.woff2      # Self-hosted font (4 weights)
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout, font loading, dark theme
│   │   ├── page.tsx                    # Dashboard (server component shell)
│   │   ├── globals.css                 # Tailwind directives + CSS vars
│   │   └── api/
│   │       ├── sessions/
│   │       │   ├── route.ts            # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       ├── route.ts        # GET (detail), PATCH (pause/resume/kill), DELETE
│   │       │       ├── fork/
│   │       │       │   └── route.ts    # POST (fork session)
│   │       │       └── experiments/
│   │       │           └── route.ts    # GET (experiments for session)
│   │       ├── gpus/
│   │       │   └── route.ts            # GET (GPU status via nvidia-smi)
│   │       ├── stream/
│   │       │   └── route.ts            # GET (SSE endpoint for live updates)
│   │       └── health/
│   │           └── route.ts            # GET (health check for uptime kuma)
│   ├── lib/
│   │   ├── db.ts                       # SQLite schema + connection
│   │   ├── git.ts                      # Git worktree + branch operations
│   │   ├── gpu.ts                      # nvidia-smi parser
│   │   ├── process-manager.ts          # tmux session spawn/kill/pause
│   │   ├── results-parser.ts           # Parse results.tsv → Experiment[]
│   │   ├── log-tailer.ts              # Tail run.log for live experiment status
│   │   ├── sse-broker.ts              # SSE fan-out broker
│   │   ├── watcher.ts                 # File watcher (results.tsv + git log)
│   │   ├── telegram.ts               # Telegram alert on breakthrough
│   │   └── types.ts                   # Shared TypeScript types
│   ├── components/
│   │   ├── dashboard.tsx              # Main dashboard layout (client component)
│   │   ├── session-list.tsx           # Left sidebar session cards
│   │   ├── session-card.tsx           # Individual session card
│   │   ├── session-detail.tsx         # Right panel session detail view
│   │   ├── comparison-view.tsx        # Multi-session overlay comparison
│   │   ├── gpu-bar.tsx                # GPU utilization status
│   │   ├── sparkline.tsx              # Inline SVG sparkline
│   │   ├── progress-chart.tsx         # Large D3 val_bpb chart
│   │   ├── experiment-timeline.tsx    # Horizontal scrollable dot timeline
│   │   ├── commit-feed.tsx            # Recent committed experiments list
│   │   ├── code-heatmap.tsx           # Mutation heatmap for train.py regions
│   │   ├── new-session-modal.tsx      # Launch new session dialog
│   │   ├── status-badge.tsx           # Session status indicator
│   │   └── icons.tsx                  # Minimal icon set (SVG)
│   ├── stores/
│   │   └── session-store.ts           # Zustand store (sessions, selection, SSE)
│   └── hooks/
│       ├── use-sse.ts                 # SSE connection hook with reconnect
│       └── use-gpu-poll.ts            # GPU status polling hook
└── scripts/
    └── seed-demo.ts                   # Generate demo data for development
```

## Data Model

### SQLite Schema

```sql
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,          -- nanoid, 12 chars
  tag           TEXT NOT NULL UNIQUE,      -- e.g. "mar12-arch-search"
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK(status IN ('queued','running','paused','completed','failed','killed')),
  gpu_index     INTEGER,                  -- nullable, null = unassigned
  agent_type    TEXT NOT NULL,             -- "claude-code" | "codex" | "aider" | "gemini-cli"
  strategy      TEXT NOT NULL,             -- program.md content / description
  branch        TEXT NOT NULL,             -- "autoresearch/<tag>"
  worktree_path TEXT,                      -- absolute path to git worktree
  seed_from     TEXT,                      -- session id to cherry-pick best train.py from
  tmux_session  TEXT,                      -- tmux session name for process management
  program_md    TEXT,                      -- full program.md content for this session
  best_val_bpb  REAL,                      -- cached best val_bpb (updated on experiment insert)
  experiment_count INTEGER DEFAULT 0,      -- cached count
  commit_count  INTEGER DEFAULT 0,         -- cached committed count
  started_at    INTEGER,                   -- unix ms
  finished_at   INTEGER,                   -- unix ms
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE experiments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  run_number    INTEGER NOT NULL,          -- sequential within session
  val_bpb       REAL NOT NULL,
  peak_vram_mb  REAL,
  duration_s    REAL,
  committed     INTEGER NOT NULL DEFAULT 0,  -- boolean: was this improvement kept?
  change_summary TEXT,                     -- extracted from git commit message
  git_hash      TEXT,                      -- commit hash if committed
  delta         REAL,                      -- val_bpb delta from previous best
  log_tail      TEXT,                      -- last 20 lines of run.log
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX idx_experiments_session ON experiments(session_id, run_number);

CREATE TABLE gpu_assignments (
  gpu_index     INTEGER PRIMARY KEY,
  session_id    TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  assigned_at   INTEGER
);

CREATE TABLE alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK(type IN ('breakthrough','failure','completed','stall')),
  message       TEXT NOT NULL,
  sent          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
```

### Session State Machine

```
                    ┌──────────┐
           create → │  queued  │
                    └────┬─────┘
                         │ gpu available
                         ▼
                    ┌──────────┐
          ┌────────│ running  │────────┐
          │        └──┬───┬───┘        │
          │ pause     │   │ kill       │ agent exits cleanly
          ▼           │   ▼            ▼
     ┌────────┐       │ ┌────────┐ ┌───────────┐
     │ paused │       │ │ killed │ │ completed │
     └───┬────┘       │ └────────┘ └───────────┘
         │ resume     │
         └────────────┘
                      │ crash / timeout
                      ▼
                 ┌────────┐
                 │ failed │
                 └────────┘
```

Transitions:
- `queued → running`: Triggered by GPU scheduler when a GPU becomes available. Creates git worktree, spawns tmux session with agent.
- `running → paused`: Sends SIGSTOP to tmux session. GPU stays assigned (configurable: release GPU on pause).
- `paused → running`: Sends SIGCONT to tmux session.
- `running → killed`: Sends SIGTERM to tmux session, cleans up worktree (optional, keep by default).
- `running → completed`: Agent process exits with code 0. Auto-detected by process monitor.
- `running → failed`: Agent process exits non-zero, or 10-minute timeout on a single experiment.

### Experiment Data (from results.tsv)

The autoresearch agent writes `results.tsv` in the worktree. Format:
```
run_number	tag	description	val_bpb	peak_vram_mb
0	baseline	baseline (no changes)	0.997900	45060.2
1	muon_lr_sweep	lower muon lr from 0.05 to 0.03	0.993200	44820.1
```

The watcher parses this file on change, diffs against known experiments in SQLite, and inserts new rows. `committed` is derived by checking if the corresponding git commit exists on the branch (i.e., branch HEAD advanced).

### SSE Event Types

```typescript
type SSEEvent =
  | { type: 'experiment'; sessionId: string; experiment: Experiment }
  | { type: 'session-status'; sessionId: string; status: SessionStatus }
  | { type: 'gpu-update'; gpus: GpuInfo[] }
  | { type: 'alert'; alert: Alert }
  | { type: 'heartbeat' }
```

SSE endpoint: `GET /api/stream` — long-lived connection, `text/event-stream`. Heartbeat every 15s.

## Features

### F1: Session Lifecycle Management

**Create session:**
- User provides: tag (slug, unique), agent type, GPU preference (or auto), strategy text, optional seed-from session
- System: validates tag uniqueness, writes `program.md` to a temp location, creates DB record with status `queued`
- If GPU available immediately: transitions to `running` (see F3)
- If no GPU: stays `queued`, GPU scheduler auto-promotes when available

**Pause session:**
- PATCH `/api/sessions/[id]` with `{ action: 'pause' }`
- Sends SIGSTOP to tmux session process group
- Updates status to `paused`
- Edge case: if agent is mid-training-run, the GPU stays allocated. VRAM is NOT freed. The pause is a process-level suspend, not a graceful stop.

**Resume session:**
- PATCH `/api/sessions/[id]` with `{ action: 'resume' }`
- Sends SIGCONT
- Status back to `running`

**Kill session:**
- PATCH `/api/sessions/[id]` with `{ action: 'kill' }`
- Sends SIGTERM to tmux, waits 5s, SIGKILL if still alive
- Status to `killed`
- Worktree preserved (not deleted) — user can fork from it later

**Fork session:**
- POST `/api/sessions/[id]/fork`
- Body: `{ tag, strategy?, gpu? }`
- Creates new session seeded from the source session's best `train.py` commit
- Git: checkout the commit with best val_bpb, create new worktree from that point
- New session starts from the fork point, not from master baseline

### F2: Real-Time Experiment Telemetry

**Data flow:**
```
Agent writes results.tsv → fs.watch detects change → parser extracts new rows
→ diff against SQLite → insert new experiments → SSE broadcast to all clients
```

Additionally, on each new experiment:
- Parse git log on the branch to determine if new commits appeared (= experiment was committed)
- Extract commit message as `change_summary`
- Compute `delta` from previous best val_bpb
- Update session cached `best_val_bpb`, `experiment_count`, `commit_count`

**Log tailing:**
- Tail `run.log` in each worktree for the currently running experiment
- Detect: "Training started", progress, "val_bpb: X.XXXX", errors
- Surface last 20 lines in session detail view

### F3: GPU Scheduling

**GPU discovery:**
- Parse `nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits`
- Refresh every 10 seconds
- Expose via `GET /api/gpus`

**Assignment logic (simple FIFO):**
- On session create or GPU freed: scan `queued` sessions in created_at order
- Assign first queued session to first free GPU
- Set `CUDA_VISIBLE_DEVICES=<idx>` in the spawned tmux environment
- One session per GPU at a time (no MPS/MIG sharing)

**GPU bar UI:**
- Per GPU: name, VRAM usage %, utilization %, temperature
- Active session tag shown on each GPU
- Color coding: idle (gray), active (cyan), hot (>80°C orange, >90°C red)

### F4: Process Management (tmux)

**Spawn flow:**
```bash
# 1. Create git worktree
git worktree add /path/to/worktrees/<tag> -b autoresearch/<tag> master

# 2. If seed_from: cherry-pick best train.py
cp /path/to/worktrees/<seed_tag>/train.py /path/to/worktrees/<tag>/train.py
cd /path/to/worktrees/<tag> && git add train.py && git commit -m "seed from <seed_tag> best"

# 3. Write program.md into worktree
cp <session.program_md> /path/to/worktrees/<tag>/program.md

# 4. Spawn tmux session
tmux new-session -d -s autoresearch-<tag> -c /path/to/worktrees/<tag>
tmux send-keys -t autoresearch-<tag> "CUDA_VISIBLE_DEVICES=<gpu> claude --model claude-opus-4-6 --print 'Read program.md and begin autonomous experimentation. Setup first, then run experiments continuously.'" Enter
```

For non-Claude Code agents, the spawn command changes:
- Codex: `codex --model o4-mini --auto-edit --full-auto`
- Aider: `aider --model claude-3.5-sonnet train.py`
- Custom: user-provided command template

**Cleanup on kill:**
```bash
tmux kill-session -t autoresearch-<tag>
# Worktree preserved by default
```

### F5: Multi-Session Comparison View

**Toggle compare:**
- Each session card has a ◆/◇ toggle button
- Toggled sessions appear in the comparison chart overlay
- Comparison view shows all selected sessions' val_bpb curves on one chart

**Chart (D3):**
- X axis: experiment number (0 to max across selected sessions)
- Y axis: val_bpb (auto-scaled to data range with 0.005 padding)
- One line per session, unique color per session
- Dots on committed experiments, hollow dots on discarded
- Gold ring on global best per session
- Session tag label at line end
- Y grid lines, axis labels in monospace

**Comparison table:**
- Columns: Session, Agent, Experiments, Commits, Hit Rate, Best BPB, Δ from Baseline (0.998), Duration
- Sortable by any column (click header)

### F6: Session Detail View

When a session is selected from the sidebar:

**Header:** Tag, status badge, agent name, branch name, elapsed time, action buttons (Pause, Kill, Fork)

**Strategy block:** Full program.md summary text

**Metrics row (5 cards):**
- Best val_bpb (cyan, prominent)
- Experiment count
- Committed count (green)
- Hit rate % (amber)
- Avg delta per committed experiment (purple)

**Experiment timeline:** Horizontal scrollable SVG. Each experiment = dot. Y position = val_bpb (higher = worse). Committed = cyan filled, discarded = gray, best = gold ring. Auto-scrolls to latest.

**Recent commits feed:** Last 8 committed experiments. Shows: delta value (color-coded by magnitude), change summary, experiment number.

**Code mutation heatmap:** Shows which regions of train.py are being most frequently modified. Regions: Model Config, Attention, MLP/FFN, Embeddings, Optimizer, LR Schedule, Training Loop, Eval/Logging. Heat derived from git diff --stat on committed changes.

**Cross-pollinate hint:** Visual prompt to fork this session's best into a new session.

### F7: New Session Modal

Fields:
- **Tag** (required): text input, auto-generated suggestion `mar<DD>-exp-<random>`
- **Strategy** (required): textarea, the research direction / program.md instructions
- **Agent** (required): dropdown — Claude Code, Codex, Aider, Gemini CLI
- **GPU** (required): dropdown — list discovered GPUs, or "Auto (next available)"
- **Seed From** (optional): dropdown — list existing sessions with their best val_bpb, or "Fresh baseline (master)"
- **Agent Command Override** (optional, collapsed by default): text input for custom agent spawn command

Validation:
- Tag must be unique, slug-safe (lowercase, hyphens, no spaces)
- Strategy must be non-empty
- If selected GPU is occupied, session starts as `queued`

### F8: Telegram Alerts

Alert conditions:
- **Breakthrough:** New best val_bpb that beats ALL sessions' previous global best
- **Session completed:** Agent exited cleanly
- **Session failed:** Agent crashed or experiment timeout
- **Stall detected:** No new experiment in 15 minutes while status is `running`

Alert format:
```
🔬 [AUTORESEARCH] <type>
Session: <tag>
<type-specific details>
Best: <val_bpb>
Experiments: <count> (<committed> committed)
```

Telegram bot token and chat ID from env vars. Uses LUMO's existing bot token if available.

### F9: Health Check

`GET /api/health` returns:
```json
{
  "status": "ok",
  "sessions": { "running": 2, "queued": 1, "total": 5 },
  "gpus": 2,
  "uptime_s": 86400
}
```

For Uptime Kuma integration.

## UI Design

**Aesthetic:** Bloomberg terminal / mission control. Dense, dark, functional. Not decorative.

**Theme:**
- Background: `#020617` (slate-950)
- Surface: `#0f172a` (slate-900)
- Border: `#1e293b` (slate-800)
- Text primary: `#e2e8f0` (slate-200)
- Text secondary: `#94a3b8` (slate-400)
- Text muted: `#475569` (slate-600)
- Accent: `#22d3ee` (cyan-400)
- Success: `#34d399` (emerald-400)
- Warning: `#fbbf24` (amber-400)
- Error: `#f87171` (red-400)
- Purple: `#a78bfa` (violet-400)
- Pink: `#f472b6` (pink-400)

**Font:** JetBrains Mono (self-hosted woff2). Weights: 300, 400, 600, 700. NO system fonts, NO Inter, NO fallbacks used for display.

**Layout (desktop, single page):**
```
┌─────────────────────────────────────────────────────────┐
│ HEADER: Logo + "AUTORESEARCH MISSION CONTROL" | tabs | +NEW SESSION btn │
├─────────────────────────────────────────────────────────┤
│ STATS BAR: Sessions active/total | Experiments | Global best | Commit rate │
├──────────────┬──────────────────────────────────────────┤
│ SIDEBAR      │ MAIN CONTENT                             │
│ 340px fixed  │ flex-1, scrollable                       │
│              │                                          │
│ GPU STATUS   │ (dashboard: session detail)              │
│              │ (compare: multi-session overlay)         │
│ SESSION      │                                          │
│ CARDS        │                                          │
│ (scrollable) │                                          │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
```

**Status badges:**
| Status | Background | Text | Dot |
|--------|-----------|------|-----|
| running | `#064e3b` | `#34d399` | pulsing `#34d399` |
| completed | `#1e1b4b` | `#a78bfa` | static `#a78bfa` |
| queued | `#1c1917` | `#78716c` | static `#78716c` |
| failed | `#450a0a` | `#f87171` | static `#f87171` |
| paused | `#422006` | `#fbbf24` | static `#fbbf24` |
| killed | `#1c1917` | `#78716c` | static `#78716c` |

**Animations:**
- Status badge dot: `pulse` keyframe for `running` only
- Sparkline: no animation (static render)
- New experiment dot: fade-in
- Session card hover: subtle background shift
- Modal: backdrop fade + content scale-in

**Mobile:** Not a priority. Sidebar collapses to bottom sheet. Session list becomes horizontal scroll. Functional but not optimized.

## Failure Handling

| Condition | User-facing message | Recovery |
|-----------|-------------------|----------|
| nvidia-smi not found | "No NVIDIA GPUs detected. GPU monitoring disabled." | Graceful fallback — sessions still create but GPU assignment is manual |
| tmux not installed | Fatal on startup: "tmux is required. Install with `apt install tmux`" | Block startup |
| Git repo not found at configured path | "Autoresearch repo not found at <path>. Configure AUTORESEARCH_REPO_PATH." | Block session creation |
| results.tsv parse error | Log warning, skip malformed row, continue watching | Silent skip |
| Agent process crash | Status → `failed`, alert fired, GPU freed | Auto-queue next session if exists |
| Git worktree conflict | "Branch autoresearch/<tag> already exists" | User must choose different tag |
| SQLite locked | Retry 3x with 100ms backoff | Log error if still fails |
| SSE connection dropped | Client auto-reconnects in 3s, shows "Reconnecting..." | Automatic |
| Telegram API failure | Log warning, mark alert unsent | Retry on next alert cycle |

## Environment Variables

```env
# Required
AUTORESEARCH_REPO_PATH=/home/lumo/autoresearch        # Path to cloned autoresearch repo
AUTORESEARCH_WORKTREE_DIR=/home/lumo/autoresearch-runs # Where worktrees are created

# Optional
PORT=3100                                               # Server port (default 3100)
TELEGRAM_BOT_TOKEN=                                     # For alerts
TELEGRAM_CHAT_ID=                                       # For alerts
DEFAULT_AGENT=claude-code                               # Default agent type
DEFAULT_AGENT_COMMAND=claude --model claude-opus-4-6     # Default spawn command
CLAUDE_CODE_ARGS=--print                                # Additional args for claude code
```

## Build Order — 6 Sessions

### Session 1: Foundation — DB + Types + Project Scaffold
Deliverables:
- [ ] Next.js 15 project initialized with App Router, Tailwind 4, TypeScript strict
- [ ] `src/lib/types.ts` — all TypeScript interfaces/types from data model
- [ ] `src/lib/db.ts` — SQLite schema creation, connection singleton, basic CRUD helpers
- [ ] `src/app/layout.tsx` — root layout with dark theme, JetBrains Mono font loading
- [ ] `src/app/globals.css` — Tailwind directives, CSS variables for the theme
- [ ] `src/app/api/health/route.ts` — health endpoint returning JSON
- [ ] `.env.example` with all env vars documented
- [ ] `package.json` with all dependencies listed

Verify:
- `pnpm install && pnpm build` — exits 0
- `npx tsc --noEmit` — exits 0
- `curl -f http://localhost:3100/api/health` — returns `{"status":"ok"}`
- `sqlite3 autoresearch.db ".tables"` — shows `sessions experiments gpu_assignments alerts`
- `grep -r "any" src/ --include="*.ts" --include="*.tsx" -l | wc -l` — expect 0

Regression: n/a (first session)

---

### Session 2: Backend Core — Git, Process Manager, GPU, Watcher
Deliverables:
- [ ] `src/lib/git.ts` — createWorktree, deleteWorktree, getBranchLog, getBestCommit, cherryPickTrainPy
- [ ] `src/lib/process-manager.ts` — spawnSession (tmux), pauseSession (SIGSTOP), resumeSession (SIGCONT), killSession (SIGTERM→SIGKILL)
- [ ] `src/lib/gpu.ts` — parseNvidiaSmi, getGpuStatus, findFreeGpu
- [ ] `src/lib/results-parser.ts` — parseResultsTsv returning Experiment[]
- [ ] `src/lib/watcher.ts` — watchSessionFiles (fs.watch on results.tsv + git log per session)
- [ ] `src/lib/log-tailer.ts` — tailRunLog returning last N lines
- [ ] Unit-testable: each module exports pure functions where possible, side effects isolated

Verify:
- `npx tsc --noEmit` — exits 0
- `node -e "require('./src/lib/results-parser').parseResultsTsv('run_number\ttag\tdescription\tval_bpb\tpeak_vram_mb\n0\tbaseline\tbaseline\t0.997900\t45060.2')"` — parses without error
- `grep -r "console.log" src/lib/ --include="*.ts" | wc -l` — expect 0

Regression:
- Session 1: `pnpm build` exits 0, `curl -f http://localhost:3100/api/health` returns ok

---

### Session 3: API Routes — Full CRUD + SSE
Deliverables:
- [ ] `src/lib/sse-broker.ts` — SSE broker: subscribe, broadcast, heartbeat
- [ ] `src/app/api/sessions/route.ts` — GET (list with pagination), POST (create session)
- [ ] `src/app/api/sessions/[id]/route.ts` — GET (detail + experiments), PATCH (pause/resume/kill), DELETE
- [ ] `src/app/api/sessions/[id]/fork/route.ts` — POST (fork from best commit)
- [ ] `src/app/api/sessions/[id]/experiments/route.ts` — GET (experiments list with offset/limit)
- [ ] `src/app/api/gpus/route.ts` — GET (GPU status)
- [ ] `src/app/api/stream/route.ts` — GET SSE endpoint, connects to broker
- [ ] Session creation triggers: DB insert → worktree creation → tmux spawn → watcher start
- [ ] Watcher on new experiment: inserts to DB → broadcasts SSE event

Verify:
- `npx tsc --noEmit` — exits 0
- `curl -X POST http://localhost:3100/api/sessions -H 'Content-Type: application/json' -d '{"tag":"test-1","agentType":"claude-code","strategy":"test strategy"}'` — returns 201 with session JSON
- `curl http://localhost:3100/api/sessions` — returns array with the created session
- `curl http://localhost:3100/api/sessions/<id>` — returns session detail
- `curl -X PATCH http://localhost:3100/api/sessions/<id> -H 'Content-Type: application/json' -d '{"action":"kill"}'` — returns 200, status is "killed"
- `curl -N http://localhost:3100/api/stream` — receives heartbeat events

Regression:
- Session 1: health endpoint works
- Session 2: `npx tsc --noEmit` exits 0

---

### Session 4: UI Shell — Layout, Sidebar, Session Cards, GPU Bar
Deliverables:
- [ ] `src/stores/session-store.ts` — Zustand store: sessions[], selectedId, compareIds[], actions
- [ ] `src/hooks/use-sse.ts` — SSE hook with auto-reconnect, dispatches to Zustand store
- [ ] `src/hooks/use-gpu-poll.ts` — polls /api/gpus every 10s
- [ ] `src/components/dashboard.tsx` — main layout: header + stats bar + sidebar + main content
- [ ] `src/components/session-list.tsx` — sidebar with session cards, GPU bar
- [ ] `src/components/session-card.tsx` — tag, status badge, sparkline, metrics, compare toggle
- [ ] `src/components/gpu-bar.tsx` — per-GPU card with utilization/temp/active session
- [ ] `src/components/status-badge.tsx` — colored badge with pulsing dot for running
- [ ] `src/components/sparkline.tsx` — inline SVG sparkline from experiment data
- [ ] `src/components/icons.tsx` — minimal SVG icon components
- [ ] `src/app/page.tsx` — renders Dashboard component

Verify:
- `pnpm build` — exits 0
- `npx tsc --noEmit` — exits 0
- Open `http://localhost:3100` in browser — sees dark dashboard with sidebar, session cards render
- Sidebar scrolls independently from main content
- Status badges show correct colors per status
- GPU bar renders (even if nvidia-smi unavailable — graceful fallback)
- SSE reconnects when server restarts (observe in Network tab)

Regression:
- Session 1: health endpoint
- Session 3: all API routes still respond correctly

---

### Session 5: UI Detail — Session Detail, Charts, Timeline, Heatmap
Deliverables:
- [ ] `src/components/session-detail.tsx` — full detail view with all sub-components
- [ ] `src/components/progress-chart.tsx` — D3-rendered val_bpb chart (SVG)
- [ ] `src/components/experiment-timeline.tsx` — horizontal scrollable dot timeline, auto-scroll right
- [ ] `src/components/commit-feed.tsx` — last 8 committed experiments with delta + summary
- [ ] `src/components/code-heatmap.tsx` — mutation heatmap derived from git diff stats
- [ ] `src/components/comparison-view.tsx` — multi-session overlay chart + comparison table
- [ ] Action buttons: Pause, Resume, Kill, Fork — wired to API, update Zustand
- [ ] View toggle: "DASHBOARD" and "COMPARE" tabs in header
- [ ] Selecting session in sidebar shows detail; toggling ◆ adds to comparison

Verify:
- `pnpm build` — exits 0
- `npx tsc --noEmit` — exits 0
- Click session card → detail view renders with metrics, timeline, commit feed
- Click ◆ on multiple sessions → switch to COMPARE tab → overlay chart shows
- Pause button → API call → status changes to paused → badge updates
- Kill button → API call → status changes to killed
- Fork button → opens new session modal pre-filled with seed-from
- New experiment arrives via SSE → timeline updates, sparkline updates, metrics update

Regression:
- Session 1: health
- Session 3: API routes
- Session 4: dashboard layout renders

---

### Session 6: New Session Modal + Telegram Alerts + Docker + Polish
Deliverables:
- [ ] `src/components/new-session-modal.tsx` — full modal with all fields, validation, launch
- [ ] `src/lib/telegram.ts` — sendAlert function, alert condition evaluation
- [ ] Alert integration: on new experiment → check breakthrough; on status change → check completed/failed; on stall → 15min timer
- [ ] `Dockerfile` — multi-stage Node.js build
- [ ] `docker-compose.yml` — single service with volume mounts for repo, worktrees, sqlite
- [ ] `.env.example` updated with all final env vars
- [ ] `scripts/seed-demo.ts` — creates 3 demo sessions with experiments for development/demo
- [ ] Mobile basic: sidebar as bottom sheet on viewport < 768px
- [ ] Error boundaries on all client components
- [ ] Loading states: skeleton placeholders while SSE connects and initial data loads

Verify:
- `pnpm build` — exits 0
- `npx tsc --noEmit` — exits 0
- `docker compose build` — exits 0
- `docker compose up -d && sleep 5 && curl -f http://localhost:3100/api/health` — returns ok
- Click "+ NEW SESSION" → modal opens → fill fields → Launch → session appears in sidebar
- Create session with breakthrough val_bpb → Telegram message received (if configured)
- Resize browser to mobile width → sidebar collapses to bottom sheet
- `grep -r "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l` — expect 0

Regression:
- Session 1: health
- Session 3: all API CRUD routes
- Session 4: dashboard layout
- Session 5: detail view, comparison view, action buttons
