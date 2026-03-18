# Autoresearch Mission Control — Step-by-Step Execution Guide

**Starting point:** You have downloaded `20260313_autoresearch_forge_package.tar.gz` to your homelab. Nothing else exists yet.

---

## Step 0 — Verify Prerequisites

SSH into your homelab and verify everything is installed:

```bash
node --version      # Need 22+ (if missing: nvm install 22)
pnpm --version      # Need 9+  (if missing: npm i -g pnpm)
tmux -V             # Any version (if missing: sudo apt install tmux)
git --version       # Any version
nvidia-smi          # Optional — UI works without GPU, just no GPU bar
```

Verify Claude Code CLI is installed and authenticated:

```bash
claude --version
claude --print "hello"   # Should respond — confirms auth works
```

If Claude Code is not installed:

```bash
npm i -g @anthropic-ai/claude-code
claude auth login
```

---

## Step 1 — Clone Karpathy's Autoresearch Repo

This is the upstream repo that your agents will experiment on. The UI creates git worktrees from it.

```bash
cd /home/lumo
git clone https://github.com/karpathy/autoresearch.git
```

This gives you `/home/lumo/autoresearch/` with `train.py`, `prepare.py`, `program.md`, etc.

Create the directory where worktrees (per-session isolated copies) will live:

```bash
mkdir -p /home/lumo/autoresearch-runs
```

You now have:

```
/home/lumo/
├── autoresearch/              ← Karpathy's repo (source of truth)
└── autoresearch-runs/         ← Empty, worktrees go here later
```

---

## Step 2 — Extract the FORGE Package

```bash
cd /home/lumo
tar xzf /path/to/20260313_autoresearch_forge_package.tar.gz
```

This creates `/home/lumo/forge-autoresearch/`. Rename it to the actual project name:

```bash
mv forge-autoresearch autoresearch-control
cd autoresearch-control
```

Verify the contents:

```bash
ls -la
```

You should see:

```
TASKSPEC.md                  ← The spec (canonical, ~500 lines)
CLAUDE.md                    ← Agent rules (loaded every session)
AUDIT.md                     ← Risk assessment
README.md                    ← Package overview
bootstrap.sh                 ← (ignore this, we're doing it manually)
autoresearch-control.jsx     ← UI prototype for visual reference (not used by Claude Code)
.claude/
  settings.local.json        ← Tool permissions (Bash, Edit, Write, Read all allowed)
sessions/
  session-1-prompt.md        ← Foundation
  session-2-prompt.md        ← Backend core
  session-3-prompt.md        ← API routes + SSE
  session-4-prompt.md        ← UI shell
  session-5-prompt.md        ← UI detail + charts
  session-6-prompt.md        ← Polish + Docker
```

You now have:

```
/home/lumo/
├── autoresearch/              ← Karpathy's repo
├── autoresearch-runs/         ← Empty worktree dir
└── autoresearch-control/      ← YOU ARE HERE — FORGE project
    ├── TASKSPEC.md
    ├── CLAUDE.md
    ├── AUDIT.md
    ├── .claude/settings.local.json
    └── sessions/1-6
```

---

## Step 3 — Initialize Git

Claude Code works best inside a git repo. Initialize one:

```bash
cd /home/lumo/autoresearch-control
git init
git add TASKSPEC.md CLAUDE.md AUDIT.md .claude/
git commit -m "FORGE: spec + agent rules + audit"
```

Don't add the session prompts to git — they're for you to paste, not for the agent to read.

---

## Step 4 — Review TASKSPEC.md (Do This Before Executing)

Open `TASKSPEC.md` in your editor. Verify three things:

**4a. Paths match your setup:**

The spec assumes:
```
AUTORESEARCH_REPO_PATH=/home/lumo/autoresearch
AUTORESEARCH_WORKTREE_DIR=/home/lumo/autoresearch-runs
```

If your paths differ, add an addendum at the bottom of TASKSPEC.md:

```markdown
## ADDENDUM — PATH CORRECTION 2026-03-13
- Original assumption: repo at /home/lumo/autoresearch
- Reality: repo at /home/lumo/projects/autoresearch
- Corrected: AUTORESEARCH_REPO_PATH=/home/lumo/projects/autoresearch
```

**4b. Port 3100 is free:**

```bash
ss -tlnp | grep 3100
```

If occupied, update the port in the TASKSPEC addendum.

**4c. GPU availability:**

```bash
nvidia-smi
```

If you have GPUs, note the count. If no GPU, the UI still works — GPU bar shows "No GPUs detected" and sessions create without GPU assignment. No spec change needed.

---

## Step 5 — Execute Session 1 (Foundation)

```bash
cd /home/lumo/autoresearch-control
claude --model claude-opus-4-6
```

Claude Code opens. Now:

1. **Copy** the entire contents of `sessions/session-1-prompt.md`
2. **Paste** it into Claude Code
3. Let it plan first — review the plan before approving execution
4. Let it build

When it says it's done, **YOU** run the verification gates (not the agent):

```bash
# Open a separate terminal for gate checks
cd /home/lumo/autoresearch-control

# Gate 1: Build passes
pnpm install && pnpm build

# Gate 2: Type safety
npx tsc --noEmit

# Gate 3: Health endpoint works
PORT=3100 pnpm start &
sleep 3
curl -sf http://localhost:3100/api/health | jq .status
# Expect: "ok"
kill %1

# Gate 4: Database tables exist
sqlite3 data/autoresearch.db ".tables"
# Expect: alerts  experiments  gpu_assignments  sessions

# Gate 5: No TypeScript `any`
grep -rn "any" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts" | wc -l
# Expect: 0

# Gate 6: No console.log
grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l
# Expect: 0
```

**If a gate fails**, go back to the Claude Code terminal and paste:

```
STOP. [paste the exact error output here].
Root cause: [your best guess at what went wrong].
Fix: [what needs to change].
Verify: [the exact command that failed].
Do not touch anything else.
```

**If all gates pass**, go to Claude Code terminal and type:

```
/clear
```

This wipes context for a clean session 2.

---

## Step 6 — Execute Session 2 (Backend Core)

Same Claude Code terminal (after `/clear`):

1. **Paste** contents of `sessions/session-2-prompt.md`
2. Let it execute

**Run session 2 verification gates:**

```bash
# Own gates
npx tsc --noEmit
grep -rn "child_process.*exec[^F]" src/lib/ --include="*.ts" | wc -l
# Expect: 0 (no exec(), only execFile())

grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l
# Expect: 0

grep -rn "any" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts" | wc -l
# Expect: 0
```

**Run regression gates (re-verify session 1 didn't break):**

```bash
pnpm build
PORT=3100 pnpm start &
sleep 3
curl -sf http://localhost:3100/api/health | jq .status
# Expect: "ok"
kill %1
```

All pass → `/clear` → continue.

**⚠️ Session 2 is the riskiest session.** If tmux process management doesn't work cleanly, give this corrective:

```
STOP. tmux process management is unreliable.
Root cause: SIGSTOP doesn't propagate to agent child processes.
Fix: Replace tmux with child_process.spawn + PID file tracking.
     Spawn: spawn agent command directly, write PID to data/<tag>.pid.
     Kill: read PID, SIGTERM, wait 5s, SIGKILL if still alive.
     Pause/Resume: SIGSTOP/SIGCONT to process group via -<pid>.
Verify: npx tsc --noEmit passes.
Do not touch anything else.
```

---

## Step 7 — Execute Session 3 (API Routes + SSE)

Paste `sessions/session-3-prompt.md` → execute → run gates:

```bash
npx tsc --noEmit
PORT=3100 pnpm start &
sleep 3

# Health enriched with session/GPU counts
curl -sf http://localhost:3100/api/health | jq .

# GPU endpoint (returns empty array if no GPU — that's fine)
curl -sf http://localhost:3100/api/gpus

# Session list (empty)
curl -sf http://localhost:3100/api/sessions

# Create a test session
curl -X POST http://localhost:3100/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"tag":"gate-test","agentType":"claude-code","strategy":"test strategy"}'
# Expect: 201

# List shows it
curl -sf http://localhost:3100/api/sessions | jq '.[0].tag'
# Expect: "gate-test"

# Kill it
ID=$(curl -sf http://localhost:3100/api/sessions | jq -r '.[0].id')
curl -X PATCH "http://localhost:3100/api/sessions/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"action":"kill"}'
# Expect: 200

# SSE heartbeats
timeout 20 curl -N -sf http://localhost:3100/api/stream
# Expect: heartbeat events every 15s

# Duplicate tag rejected
curl -X POST http://localhost:3100/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"tag":"gate-test","agentType":"claude-code","strategy":"test"}'
# Expect: 409

kill %1
```

Regression: session 1 build + health still pass.

All pass → `/clear`

---

## Step 8 — Execute Session 4 (UI Shell)

Paste `sessions/session-4-prompt.md` → execute → run gates:

```bash
pnpm build
npx tsc --noEmit
PORT=3100 pnpm start &
sleep 3
```

Open `http://100.115.215.121:3100` (or localhost:3100) in your browser. Verify:

- [ ] Dark background (#020617) renders
- [ ] JetBrains Mono font loads (check in DevTools → Computed styles)
- [ ] Header shows "AUTORESEARCH MISSION CONTROL"
- [ ] Sidebar is ~340px wide, scrolls independently
- [ ] GPU bar renders (empty state if no GPUs)
- [ ] If session 3 test data exists: session cards with status badges appear
- [ ] DevTools → Network tab: EventSource connection to /api/stream, heartbeats arriving
- [ ] Main area shows "SELECT A SESSION" placeholder

```bash
kill %1
grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l
# Expect: 0
```

All pass → `/clear`

---

## Step 9 — Execute Session 5 (Detail View + Charts)

Paste `sessions/session-5-prompt.md` → execute → run gates:

```bash
pnpm build
npx tsc --noEmit
PORT=3100 pnpm start &
sleep 3
```

Open browser, verify:

- [ ] Click a session card → detail view renders (metrics, timeline, commit feed, heatmap)
- [ ] Toggle ◆ on 2+ sessions → switch to COMPARE tab → overlay chart with multiple colored lines
- [ ] Comparison table renders below chart, column headers are clickable to sort
- [ ] Action buttons visible (Pause, Kill, Fork)
- [ ] Resize browser → chart redraws without overflow

```bash
kill %1
grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l
# Expect: 0
```

All pass → `/clear`

---

## Step 10 — Execute Session 6 (Modal + Telegram + Docker + Polish)

Paste `sessions/session-6-prompt.md` → execute → run gates:

```bash
pnpm build
npx tsc --noEmit

# Seed demo data
npx tsx scripts/seed-demo.ts

# Browser check
PORT=3100 pnpm start &
sleep 3
```

Open browser:

- [ ] 3 demo sessions visible in sidebar
- [ ] Click "+ NEW SESSION" → modal opens
- [ ] Fill all fields → "Launch" → new session appears
- [ ] Submit with empty tag → inline red error, blocked
- [ ] Resize to 375px width → layout doesn't break

```bash
kill %1

# Docker build
docker compose build
# Expect: exits 0

docker compose up -d
sleep 8
curl -sf http://localhost:3100/api/health | jq .status
# Expect: "ok"

docker compose down

# Final hygiene
grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l
# Expect: 0
grep -rn "any" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts" | wc -l
# Expect: 0
```

---

## Step 11 — Deploy

```bash
cd /home/lumo/autoresearch-control

# Create .env from example
cp .env.example .env

# Edit .env with your values
nano .env
```

Set at minimum:

```env
AUTORESEARCH_REPO_PATH=/home/lumo/autoresearch
AUTORESEARCH_WORKTREE_DIR=/home/lumo/autoresearch-runs
PORT=3100

# Optional — Telegram alerts via LUMO's existing bot
TELEGRAM_BOT_TOKEN=  # lumo bot token — see lumo/.env on homelab
TELEGRAM_CHAT_ID=  # Peyman DM or homelab group chat ID
```

Start it:

```bash
docker compose up -d
```

Verify it's alive:

```bash
curl -sf http://100.115.215.121:3100/api/health | jq .
```

---

## Step 12 — Add to Apps Gateway

Add the proxy route to your Apps Gateway config so it's accessible at `apps.peyman.io`:

In your gateway's app registry, add:

```json
{
  "id": "autoresearch",
  "name": "Autoresearch Control",
  "port": 3100,
  "category": "AI Tools",
  "icon": "⬡"
}
```

Verify:

```bash
curl -sf https://apps.peyman.io/proxy/autoresearch/api/health | jq .
```

---

## Step 13 — Add Uptime Kuma Monitor

In Uptime Kuma (`http://100.115.215.121:3001`):

- Type: HTTP(s)
- URL: `http://100.115.215.121:3100/api/health`
- Interval: 60s
- Expected status: 200

---

## Summary of Final Directory Layout

```
/home/lumo/
├── autoresearch/              ← Karpathy's cloned repo (git source)
├── autoresearch-runs/         ← Worktrees created per session by the UI
│   ├── mar12-arch-search/     ← (created at runtime by the UI)
│   ├── mar12-hp-sweep/
│   └── ...
└── autoresearch-control/      ← This project (the UI)
    ├── TASKSPEC.md
    ├── CLAUDE.md
    ├── AUDIT.md
    ├── .claude/settings.local.json
    ├── sessions/              ← FORGE prompts (reference only after execution)
    ├── src/                   ← Next.js app (built by Claude Code)
    ├── data/autoresearch.db   ← SQLite database
    ├── docker-compose.yml
    ├── Dockerfile
    ├── .env
    └── package.json
```

---

## Mid-Session Cheat Sheet

| Situation | Action |
|-----------|--------|
| Claude Code at ~50% context | Type `/compact` |
| Session done, gates pass | Type `/clear`, paste next session prompt |
| Gate fails | Paste corrective prompt: STOP → error → root cause → fix → verify |
| Agent goes off-script | Paste: `STOP. Read TASKSPEC.md section [X]. You are deviating. Resume from [specific deliverable].` |
| Agent asks a question | Answer it, or paste: `Refer to TASKSPEC.md. The answer is there. Do not ask, derive.` |
| Spec is wrong | Stop. Add addendum to TASKSPEC.md. Regenerate affected session prompts. |
| You need to stop mid-session | `git stash` your work. Resume later with same session prompt (agent re-derives from spec). |

---

## Estimated Timeline

| Session | What | Time |
|---------|------|------|
| 1 | Foundation (scaffold, DB, types) | 15-20 min |
| 2 | Backend (git, tmux, GPU, watchers) | 30-40 min |
| 3 | API routes + SSE | 25-35 min |
| 4 | UI shell (layout, sidebar, cards) | 25-35 min |
| 5 | UI detail (D3 charts, timeline, heatmap) | 35-45 min |
| 6 | Modal + Telegram + Docker + polish | 30-40 min |
| **Total** | | **~3-4 hours** |
