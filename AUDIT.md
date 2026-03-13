# AUDIT.md — Risk Speculation Report (Greenfield)

Project: Autoresearch Mission Control
Date: 2026-03-13
Type: Greenfield — no existing code. This report projects anticipated failure modes per module.

## Module Risk Assessment

### src/lib/db.ts — SQLite + Schema
**RISK: SIMPLE**
Standard better-sqlite3 setup. Schema is straightforward.
Projected failure: SQLite busy errors under concurrent writes from multiple watchers. Mitigation: WAL mode + retry logic.

### src/lib/git.ts — Git Worktree Management
**RISK: COMPLEX**
Multiple git operations (worktree add, branch create, cherry-pick, log parsing) with lock contention risk.
Projected failures:
- Concurrent git operations on same repo cause lock failures
- Worktree paths with spaces or special chars break commands
- `git worktree add` fails if branch already exists (stale from killed session)
- Cherry-pick conflicts when seeding from another session's train.py

### src/lib/process-manager.ts — tmux Process Lifecycle
**RISK: RISKY**
Most novel and fragile module. Spawning CLI agents (Claude Code, Codex, Aider) inside tmux and managing their lifecycle via signals.
Projected failures:
- Agent process doesn't respect SIGSTOP (some agents catch signals)
- SIGTERM doesn't propagate to child processes (training script keeps running)
- tmux session name collision
- Agent exits but tmux session persists (zombie detection)
- `send-keys` with complex command strings fails on special characters
- Agent requires interactive TTY features that tmux doesn't provide
- Process group management: SIGSTOP to tmux doesn't suspend the GPU-holding training process

### src/lib/gpu.ts — nvidia-smi Parser
**RISK: MODERATE**
nvidia-smi output parsing is well-documented but format varies.
Projected failures:
- nvidia-smi not installed (WSL, Mac development) — needs graceful fallback
- Driver version changes output format
- MIG mode produces different output structure
- Stale GPU data if nvidia-smi hangs (timeout needed)

### src/lib/results-parser.ts — TSV Parser
**RISK: SIMPLE**
Tab-separated file parsing with known schema.
Projected failure: Partial writes (file watched mid-write) produce malformed last line. Mitigation: skip lines that don't parse, re-read on next change.

### src/lib/watcher.ts — File Watcher
**RISK: MODERATE**
fs.watch on multiple directories simultaneously.
Projected failures:
- fs.watch fires multiple events for single write (debounce needed)
- Watcher leak: session killed but watcher not cleaned up
- Linux inotify limit reached with many concurrent sessions
- Race: file changed but git commit not yet visible (read results.tsv before git push)

### src/lib/sse-broker.ts — Server-Sent Events
**RISK: MODERATE**
SSE in Next.js App Router is non-standard (ReadableStream-based, not Express-style).
Projected failures:
- Connection held open but client disconnected (memory leak)
- Cloudflare/nginx proxy kills idle connections (heartbeat critical)
- Multiple tabs create multiple SSE connections (fan-out overhead)
- Reconnection storm after server restart

### src/lib/telegram.ts — Alert Dispatch
**RISK: SIMPLE**
HTTP POST to Telegram Bot API. Well-understood.
Projected failure: Rate limiting if many alerts fire simultaneously. Mitigation: queue + debounce.

### src/app/api/* — API Routes
**RISK: MODERATE**
Standard REST routes, but session lifecycle mutations (create, pause, kill, fork) are multi-step operations that can partially fail.
Projected failures:
- Create session: DB insert succeeds, worktree creation fails → orphaned DB record
- Kill session: tmux kill fails but DB status updated → inconsistent state
- Fork: cherry-pick fails on merge conflict → new session in broken state
Mitigation: wrap multi-step mutations in rollback logic (delete DB record if worktree fails, etc.)

### src/stores/session-store.ts — Zustand State
**RISK: SIMPLE**
Client-side state management. Well-typed Zustand with SSE integration.
Projected failure: Stale state if SSE reconnects and misses events. Mitigation: full refresh on reconnect.

### src/components/progress-chart.tsx — D3 Chart
**RISK: MODERATE**
D3 inside React requires careful lifecycle management (useEffect + ref pattern).
Projected failures:
- D3 and React fighting over DOM ownership
- Chart doesn't resize on window resize
- Performance with >500 data points (need to virtualize or subsample)
- SVG rendering differences across browsers

### Docker + Deployment
**RISK: COMPLEX**
Native dependencies (better-sqlite3, potentially node-pty), tmux inside container, nvidia-smi access, volume mounts.
Projected failures:
- better-sqlite3 compilation fails in Docker (needs build-essential)
- tmux not available in node base image (needs apt install)
- nvidia-smi requires `--gpus all` runtime flag in Docker
- Volume mount permissions: container user can't write to host worktree dir
- SQLite file on bind mount: performance and locking issues

## Aggregate Risk Map

```
HIGH RISK   ████████ process-manager.ts (signal handling, agent lifecycle)
            ██████   Docker deployment (native deps, GPU passthrough)
MODERATE    █████    git.ts (lock contention, worktree edge cases)
            █████    watcher.ts (fs.watch reliability, leak prevention)
            ████     sse-broker.ts (connection lifecycle in App Router)
            ████     API routes (multi-step mutation rollback)
            ████     progress-chart.tsx (D3+React lifecycle)
            ███      gpu.ts (nvidia-smi format variance)
LOW RISK    ██       db.ts, results-parser.ts, telegram.ts, session-store.ts
```

## Recommended Build Order Adjustments

The process-manager.ts is the riskiest module. Session 2 should validate the tmux spawn/kill cycle early with a minimal integration test before building the full API layer on top of it. If tmux + agent spawning proves unreliable, the fallback is a simpler `child_process.spawn` model (no tmux) with PID tracking.
