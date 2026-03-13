# FORGE Session 3: API Routes — Full CRUD + SSE
Project: AUTORESEARCH MISSION CONTROL
Spec: TASKSPEC.md
Previous sessions completed: 1 (Foundation), 2 (Backend Core)

## Mission (this session)
Wire all backend library modules into Next.js API routes. Implement the SSE broker for real-time push. Every session lifecycle action (create, pause, resume, kill, fork, delete) is an API call that orchestrates the lib modules and broadcasts state changes.

## Deliverables
- [ ] `src/lib/sse-broker.ts`:
  - Singleton broker pattern
  - `subscribe(): { stream: ReadableStream, id: string }` — creates a new SSE client, returns readable stream for Next.js Response
  - `unsubscribe(id: string): void` — removes client
  - `broadcast(event: SSEEvent): void` — serializes to SSE format (`data: JSON\n\n`), pushes to all connected clients
  - Heartbeat: `setInterval` every 15s, sends `{ type: 'heartbeat' }` to all clients
  - Connection cleanup: detect closed streams via `controller.signal.addEventListener('abort')`, auto-unsubscribe
  - SSE format: `event: <type>\ndata: <json>\n\n`

- [ ] `src/app/api/stream/route.ts`:
  - GET handler: calls `broker.subscribe()`, returns `new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })`
  - Must work through Cloudflare tunnel and nginx proxy (headers critical)

- [ ] `src/app/api/sessions/route.ts`:
  - **GET**: `listSessions()` from db. Returns `Session[]` with cached metrics (best_val_bpb, experiment_count, commit_count). No pagination needed (session count is always small, <50).
  - **POST**: Create session.
    - Body: `CreateSessionInput` — `{ tag, agentType, strategy, gpu?, seedFrom? }`
    - Validate: tag is unique, slug-safe (`/^[a-z0-9-]+$/`), agentType is valid enum
    - Generate ID via nanoid(12)
    - Insert session to DB with status `queued`
    - If GPU specified and available, OR auto-assign via `findFreeGpu()`:
      - Create git worktree via `git.createWorktree()`
      - If seedFrom: `git.seedTrainPy()` from source session's best commit
      - Spawn agent via `processManager.spawnSession()`
      - Start watcher via `watcher.watchSession()` — on new experiment: insert to DB, update session cache, broadcast SSE
      - Update status to `running`, set `started_at`
    - If no GPU available: stays `queued`
    - Return 201 with created session
    - **Rollback**: if worktree creation fails after DB insert, delete the DB record. If spawn fails after worktree, delete worktree + DB record.

- [ ] `src/app/api/sessions/[id]/route.ts`:
  - **GET**: `getSession(id)` + `getExperiments(id)`. Return session with nested experiments array.
  - **PATCH**: Lifecycle actions.
    - Body: `{ action: 'pause' | 'resume' | 'kill' }`
    - `pause`: validate status is `running`. Call `processManager.pauseSession()`. Update DB status. Broadcast SSE.
    - `resume`: validate status is `paused`. Call `processManager.resumeSession()`. Update DB status. Broadcast SSE.
    - `kill`: validate status is `running` or `paused`. Call `processManager.killSession()`. Stop watcher. Update DB status + `finished_at`. Free GPU assignment. Broadcast SSE. Check if queued sessions waiting — auto-promote first one.
    - Invalid transitions: return 409 Conflict with `{ error: "Cannot <action> session in <status> state" }`
  - **DELETE**: validate status is `killed`, `completed`, or `failed`. Delete experiments. Delete session. Optionally delete worktree (query param `?deleteWorktree=true`).

- [ ] `src/app/api/sessions/[id]/fork/route.ts`:
  - **POST**: Fork session.
    - Body: `ForkSessionInput` — `{ tag, strategy?, gpu? }`
    - Source session must have at least 1 committed experiment
    - Find best val_bpb experiment's git hash
    - Create new session via the same POST /sessions logic but with `seedFrom` set
    - Return 201 with new session

- [ ] `src/app/api/sessions/[id]/experiments/route.ts`:
  - **GET**: `getExperiments(sessionId, offset, limit)`. Query params: `?offset=0&limit=100`. Return `{ experiments: Experiment[], total: number }`.

- [ ] `src/app/api/gpus/route.ts`:
  - **GET**: calls `gpu.getGpuStatus()`, enriches each GPU with assigned session info from DB. Returns `GpuInfo[]`.

- [ ] Update `src/app/api/health/route.ts`:
  - Enrich with: `sessions: { running, queued, total }`, `gpus: <count>`, `uptime_s`

- [ ] `src/lib/session-lifecycle.ts` (optional refactor):
  - If the route handlers get too large, extract lifecycle orchestration (create, pause, resume, kill, fork) into a dedicated module that routes call. Keeps routes thin.

## Scar Load — Do Not Repeat
⚠️ [RISK: API routes] Multi-step mutations (DB insert → git worktree → tmux spawn) can partially fail. Implement explicit rollback: if step N fails, undo steps 1..N-1. Never leave orphaned DB records or worktrees.
⚠️ [RISK: SSE] Next.js App Router SSE uses `ReadableStream` pattern, NOT `res.write()`. The controller's `enqueue()` method pushes data. Detect client disconnect via the abort signal on the request.
⚠️ [RISK: SSE] Cloudflare tunnel and nginx proxies buffer responses by default. The headers `Cache-Control: no-cache` and `X-Accel-Buffering: no` (for nginx) are critical.
⚠️ [Session 2 scar] All git operations through the async mutex in git.ts. API routes must await git calls — no fire-and-forget.
⚠️ [Session 2 scar] nvidia-smi may not be present. GPU routes must return empty array, not 500.
⚠️ [Known gotcha] `nanoid` v5 is ESM-only. If import fails, use `nanoid` v4 or `crypto.randomUUID()` as fallback.
⚠️ [Known gotcha] Next.js dynamic route params in App Router are `{ params: Promise<{ id: string }> }` in Next.js 15. Must await params.

## Constraints
- All API errors return JSON `{ error: string }` with appropriate HTTP status (400, 404, 409, 500).
- No 200 on errors. No swallowed exceptions.
- SSE heartbeat interval: exactly 15 seconds.
- Session tag validation regex: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` (no leading/trailing hyphens).
- GPU assignment is exclusive: one running session per GPU.

## Verification Gates
Run these after completion. All must pass.
- `npx tsc --noEmit` — exits 0
- `curl -sf http://localhost:3100/api/health | jq .` — shows sessions count and gpu count
- `curl -sf http://localhost:3100/api/gpus` — returns array (even if empty on non-GPU machine)
- `curl -sf http://localhost:3100/api/sessions` — returns `[]`
- Create test: `curl -X POST http://localhost:3100/api/sessions -H 'Content-Type: application/json' -d '{"tag":"gate-test","agentType":"claude-code","strategy":"test"}'` — returns 201
- List test: `curl -sf http://localhost:3100/api/sessions | jq '.[0].tag'` — returns "gate-test"
- Detail test: `curl -sf http://localhost:3100/api/sessions/<id> | jq .status` — returns status string
- Kill test: `curl -X PATCH http://localhost:3100/api/sessions/<id> -H 'Content-Type: application/json' -d '{"action":"kill"}'` — returns 200
- SSE test: `curl -N -sf http://localhost:3100/api/stream &` then wait 20s — see heartbeat events in output
- Duplicate tag test: POST same tag again — returns 409
- `grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l` — expect 0

## Regression Gates
- Session 1: `pnpm build` exits 0
- Session 1: `npx tsc --noEmit` exits 0
- Session 2: `grep -rn "child_process.*exec[^F]" src/lib/ --include="*.ts" | wc -l` — expect 0
