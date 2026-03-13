# FORGE Session 6: New Session Modal + Telegram + Docker + Polish
Project: AUTORESEARCH MISSION CONTROL
Spec: TASKSPEC.md
Previous sessions completed: 1 (Foundation), 2 (Backend Core), 3 (API + SSE), 4 (UI Shell), 5 (Detail + Charts)

## Mission (this session)
Complete the application: new session creation modal with validation, Telegram alerting, Docker containerization, demo seed script, mobile basic layout, error boundaries, and loading states. After this session, the app is deployable.

## Deliverables
- [ ] `src/components/new-session-modal.tsx`:
  - Triggered by: "+ NEW SESSION" button in header, or Fork button (pre-fills seedFrom)
  - Props: `onClose: () => void, onLaunch: (config: CreateSessionInput) => void, seedFrom?: string`
  - **Fields:**
    - Tag (required): text input, auto-suggestion `mar<DD>-exp-<random 2 digits>`, validation: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` min 3 chars
    - Strategy (required): textarea, placeholder "Describe research direction — this becomes program.md..."
    - Agent (required): dropdown — Claude Code (default), Codex, Aider, Gemini CLI
    - GPU (required): dropdown — dynamically populated from store.gpus + "Auto (next available)"
    - Seed From (optional): dropdown — "Fresh baseline (master)" + list of sessions with best val_bpb
    - Agent Command Override (optional, collapsed/expandable): text input for custom command
  - **Validation:**
    - Tag: required, regex match, unique check (client-side against store.sessions)
    - Strategy: required, min 10 chars
    - Show inline validation errors below each field (red text, no alert)
  - **Submit:** calls `POST /api/sessions` with form data, shows loading on button, closes on success, shows error toast on failure
  - **Styling:** modal overlay (black 70% opacity), centered card, same dark theme, form fields with dark inputs
  - **Keyboard:** Escape closes, Enter submits (when not in textarea), focus trap inside modal

- [ ] `src/lib/telegram.ts`:
  - `sendTelegramAlert(alert: Alert): Promise<void>`:
    - POST to `https://api.telegram.org/bot<token>/sendMessage`
    - Body: `{ chat_id, text, parse_mode: 'HTML' }`
    - Format per alert type:
      - breakthrough: `🔬 <b>[BREAKTHROUGH]</b>\nSession: <tag>\nNew best: <val_bpb> (Δ <delta>)\nExperiment #<num>: <summary>`
      - completed: `✅ <b>[COMPLETED]</b>\nSession: <tag>\nFinal best: <val_bpb>\n<experiment_count> experiments, <commit_count> committed`
      - failed: `❌ <b>[FAILED]</b>\nSession: <tag>\nLast best: <val_bpb>\nReason: <last log lines>`
      - stall: `⏸️ <b>[STALL]</b>\nSession: <tag>\nNo experiments for 15+ minutes\nLast best: <val_bpb>`
    - If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` not set: no-op (don't throw)
    - On API error: log warning, mark alert as unsent in DB, don't throw
  - `evaluateAlertConditions(sessionId: string, newExperiment?: Experiment): Promise<Alert | null>`:
    - Breakthrough: new experiment's val_bpb is lower than ALL sessions' best_val_bpb (global best)
    - Stall: session is running and no new experiment in 15 minutes (check timestamps)
    - Returns Alert object or null

- [ ] Wire alerts into session lifecycle:
  - In watcher callback (when new experiment arrives): call `evaluateAlertConditions()`, if alert → insert to DB → send Telegram → broadcast SSE
  - On session status change to `completed` or `failed`: generate and send alert
  - Stall detection: setInterval every 5 minutes, check all running sessions for 15-min silence

- [ ] `Dockerfile`:
  - Multi-stage build:
    ```dockerfile
    # Stage 1: Dependencies
    FROM node:22-bookworm AS deps
    WORKDIR /app
    COPY package.json pnpm-lock.yaml ./
    RUN corepack enable && pnpm install --frozen-lockfile

    # Stage 2: Build
    FROM node:22-bookworm AS builder
    WORKDIR /app
    COPY --from=deps /app/node_modules ./node_modules
    COPY . .
    RUN corepack enable && pnpm build

    # Stage 3: Runtime
    FROM node:22-bookworm-slim AS runner
    RUN apt-get update && apt-get install -y tmux git && rm -rf /var/lib/apt/lists/*
    WORKDIR /app
    COPY --from=builder /app/.next ./.next
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/package.json ./
    COPY --from=builder /app/public ./public
    ENV NODE_ENV=production
    EXPOSE 3100
    CMD ["node_modules/.bin/next", "start", "-p", "3100"]
    ```
  - Key: runtime image includes `tmux` and `git` (needed for session management)
  - Key: `node:22-bookworm-slim` not alpine (native deps)
  - Key: no GPU runtime in Dockerfile — GPU access is via host with `--gpus all` in docker-compose

- [ ] `docker-compose.yml`:
  ```yaml
  services:
    autoresearch-control:
      build: .
      container_name: autoresearch-control
      ports:
        - "3100:3100"
      volumes:
        - ./data:/app/data                          # SQLite persistence
        - ${AUTORESEARCH_REPO_PATH}:/repo:ro         # Autoresearch repo (read-only)
        - ${AUTORESEARCH_WORKTREE_DIR}:/worktrees    # Worktrees (read-write)
        - /usr/bin/nvidia-smi:/usr/bin/nvidia-smi:ro # nvidia-smi binary
        - /usr/lib/x86_64-linux-gnu/libnvidia-ml.so:/usr/lib/x86_64-linux-gnu/libnvidia-ml.so:ro
      environment:
        - AUTORESEARCH_REPO_PATH=/repo
        - AUTORESEARCH_WORKTREE_DIR=/worktrees
        - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
        - TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-}
        - PORT=3100
      deploy:
        resources:
          reservations:
            devices:
              - driver: nvidia
                count: all
                capabilities: [gpu]
      restart: unless-stopped
  ```

- [ ] `.env.example` — final version with all vars, commented

- [ ] `scripts/seed-demo.ts`:
  - Executable via `npx tsx scripts/seed-demo.ts`
  - Creates 3 demo sessions in DB with realistic experiment data (similar to mock data in the prototype)
  - Does NOT create worktrees or tmux sessions — just DB records for UI testing
  - Sessions: one "running" with 50 experiments, one "completed" with 100, one "queued" with 0

- [ ] Mobile basic layout (viewport < 768px):
  - Sidebar collapses: hidden by default, accessible via hamburger menu button in header
  - When open: overlays main content as a slide-in panel (not bottom sheet — simpler)
  - Session detail: single column, metrics row wraps to 2×3 grid
  - Charts: full width, reduced height
  - Implemented via Tailwind responsive classes (`md:` prefix for desktop layout)

- [ ] Error boundaries:
  - `src/components/error-boundary.tsx` — generic React error boundary component
  - Wrap: Dashboard, SessionDetail, ComparisonView, ProgressChart
  - Fallback UI: dark card with error message + "Reload" button
  - Errors in charts should NOT crash the entire dashboard

- [ ] Loading states:
  - Initial load (before SSE connects + first data fetch): skeleton placeholders in sidebar (3 shimmer cards) and main area
  - Chart loading: centered spinner while D3 renders
  - API action (pause/kill/fork): button shows "..." and is disabled

## Scar Load — Do Not Repeat
⚠️ [RISK: Docker] better-sqlite3 is a native module compiled at install time. The deps stage and the build stage must use the SAME base image architecture. If you use multi-stage with different bases, the native module will segfault.
⚠️ [RISK: Docker] nvidia-smi inside container requires NVIDIA Container Toolkit on the host AND `deploy.resources.reservations.devices` in compose. Without both, nvidia-smi will not be found.
⚠️ [RISK: Docker] SQLite on a bind-mounted volume has locking issues if the host filesystem doesn't support POSIX locks (e.g., some NFS mounts). On ext4/btrfs this is fine.
⚠️ [Session 3 scar] POST /api/sessions rollback: if spawn fails after worktree creation, clean up both. The modal should show the specific API error message, not a generic "Failed."
⚠️ [Session 4 scar] SSE reconnection does full data refresh. If modal is open during reconnect, don't close it or reset form state.
⚠️ [Session 5 scar] D3 chart inside error boundary: if D3 throws (bad data, NaN in scale), the error boundary catches it and shows fallback, not a white screen.
⚠️ [Known gotcha] Focus trap in modal: when modal opens, focus first input. Tab cycles within modal. Escape closes. Don't use a library — implement with `tabIndex`, `onKeyDown`, and `useRef`.
⚠️ [Known gotcha] Telegram API rate limit: max 30 messages per second. Not a concern for this app, but don't fire alerts in a tight loop.

## Constraints
- Dockerfile must produce an image under 500MB.
- Demo seed script must be idempotent: running twice doesn't create duplicate sessions (check by tag).
- Mobile layout: functional, not polished. Just don't break.
- No external UI library for modal (no headlessui, no radix). Hand-build it.
- Telegram is optional: all features work without it configured. Check env vars before calling.

## Verification Gates
Run these after completion. All must pass.
- `pnpm build` — exits 0
- `npx tsc --noEmit` — exits 0
- `docker compose build` — exits 0
- `docker compose up -d && sleep 8 && curl -sf http://localhost:3100/api/health | jq .status` — "ok"
- `docker compose down`
- Run seed: `npx tsx scripts/seed-demo.ts` — creates 3 sessions, no errors
- Open browser → 3 demo sessions visible in sidebar
- Click "+ NEW SESSION" → modal opens → fill all fields → Launch → new session appears in sidebar
- Validation: submit with empty tag → red error shown inline, submit blocked
- Validation: submit with duplicate tag → error shown
- Resize to 375px wide (mobile) → layout doesn't break, sidebar accessible via menu
- Intentionally break a chart component (throw in render) → error boundary shows fallback, rest of dashboard works
- `grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l` — expect 0
- `grep -rn "any" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".d.ts" | wc -l` — expect 0

## Regression Gates
- Session 1: `curl -sf http://localhost:3100/api/health | jq .status` — "ok"
- Session 3: `curl -sf http://localhost:3100/api/sessions` — returns array
- Session 3: SSE heartbeats on /api/stream
- Session 3: POST + GET + PATCH + DELETE session lifecycle works end-to-end
- Session 4: dashboard layout with sidebar, header, stats bar renders
- Session 5: session detail view renders with charts, timeline, heatmap
- Session 5: comparison view renders with multi-session overlay
