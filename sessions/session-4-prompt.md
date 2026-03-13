# FORGE Session 4: UI Shell — Layout, Sidebar, Session Cards, GPU Bar
Project: AUTORESEARCH MISSION CONTROL
Spec: TASKSPEC.md
Previous sessions completed: 1 (Foundation), 2 (Backend Core), 3 (API + SSE)

## Mission (this session)
Build the main dashboard shell: Zustand store, SSE client hook, the 3-zone layout (header+stats / sidebar / main content), session cards with sparklines, GPU status bar, and status badges. After this session, the user can see live session data flowing into the UI.

## Deliverables
- [ ] `src/stores/session-store.ts`:
  - State shape:
    ```typescript
    interface SessionStore {
      sessions: Session[]
      selectedId: string | null
      compareIds: string[]
      view: 'dashboard' | 'compare'
      gpus: GpuInfo[]
      connected: boolean  // SSE connection status
      // Actions
      setSessions: (sessions: Session[]) => void
      selectSession: (id: string | null) => void
      toggleCompare: (id: string) => void
      setView: (view: 'dashboard' | 'compare') => void
      setGpus: (gpus: GpuInfo[]) => void
      setConnected: (connected: boolean) => void
      addExperiment: (sessionId: string, experiment: Experiment) => void
      updateSessionStatus: (sessionId: string, status: SessionStatus) => void
    }
    ```
  - `addExperiment` must also update the session's cached `best_val_bpb`, `experiment_count`, `commit_count`
  - Use `create` from zustand (not `createStore`)

- [ ] `src/hooks/use-sse.ts`:
  - Custom hook: `useSSE()` — no parameters, reads/writes to Zustand store
  - On mount: fetch initial data (`GET /api/sessions`, `GET /api/gpus`), populate store
  - Opens EventSource to `/api/stream`
  - On `experiment` event: dispatch `addExperiment`
  - On `session-status` event: dispatch `updateSessionStatus`
  - On `gpu-update` event: dispatch `setGpus`
  - On error/close: set `connected: false`, auto-reconnect after 3 seconds
  - On open: set `connected: true`
  - Cleanup EventSource on unmount
  - Show reconnection status: if disconnected, do a full data refresh on reconnect (fetch sessions + gpus again) to recover any missed events

- [ ] `src/hooks/use-gpu-poll.ts`:
  - Polls `GET /api/gpus` every 10 seconds
  - Updates Zustand store `setGpus`
  - Cleanup interval on unmount

- [ ] `src/components/dashboard.tsx` (client component, `"use client"`):
  - Top-level component rendered by `src/app/page.tsx`
  - Calls `useSSE()` to start data flow
  - Calls `useGpuPoll()` for GPU updates
  - **Layout structure:**
    - Header bar (fixed top): logo hex icon + "AUTORESEARCH" + "MISSION CONTROL" + view tabs (DASHBOARD / COMPARE) + "+ NEW SESSION" button
    - Stats bar: 4 metric cards — sessions active/total, total experiments, global best val_bpb, overall commit rate %
    - Below: flex row — sidebar (340px fixed) + main content (flex-1, overflow-y auto)
  - Stats computed from Zustand `sessions` array
  - Connection indicator: small dot in header — green if connected, red if not, yellow if reconnecting

- [ ] `src/components/session-list.tsx`:
  - Renders inside sidebar
  - GPU status bar at top (renders `<GpuBar />`)
  - Below: scrollable list of `<SessionCard />` for each session
  - Sorted: running first, then queued, then completed/killed/failed by most recent

- [ ] `src/components/session-card.tsx`:
  - Props: `session: Session`
  - Shows: tag (bold, cyan if selected), status badge, agent name + truncated strategy, sparkline
  - Metrics row: BEST val_bpb, RUNS count, HIT% rate
  - Elapsed time since started_at
  - Compare toggle button (◆/◇) — calls `store.toggleCompare(session.id)`
  - Click handler: `store.selectSession(session.id)` + `store.setView('dashboard')`
  - Selected state: left cyan border, darker background
  - Hover: subtle background shift

- [ ] `src/components/gpu-bar.tsx`:
  - Renders per-GPU card from `store.gpus`
  - Each card: GPU name, utilization bar (% width, color by threshold), temperature, active session tag or "idle"
  - Color thresholds: idle=gray, active <80%=cyan, 80-90%=orange, >90%=red

- [ ] `src/components/status-badge.tsx`:
  - Props: `status: SessionStatus`
  - Renders: colored background + text + dot
  - Dot pulses (`animation: pulse 1.5s ease-in-out infinite`) for `running` only
  - Colors exactly matching TASKSPEC UI Design status badge table

- [ ] `src/components/sparkline.tsx`:
  - Props: `data: Experiment[], width?: number, height?: number, color?: string, showBest?: boolean`
  - Pure SVG — polyline for trend, circles for data points
  - Committed experiments: filled circles in accent color
  - Discarded: smaller, muted circles
  - Best experiment: gold ring circle
  - No D3 dependency — this is simple enough for hand-crafted SVG

- [ ] `src/components/icons.tsx`:
  - Minimal inline SVG icon components: `HexIcon`, `PauseIcon`, `PlayIcon`, `StopIcon`, `ForkIcon`, `CompareIcon`, `PlusIcon`, `ChevronIcon`
  - Each component: `(props: { size?: number, className?: string }) => JSX.Element`
  - No icon library dependency

- [ ] `src/app/page.tsx`:
  - Server component shell that renders `<Dashboard />` (client component)

## Scar Load — Do Not Repeat
⚠️ [RISK: SSE reconnect] EventSource auto-reconnects but does NOT replay missed events. On reconnect, the hook MUST do a full data fetch (GET /sessions, GET /gpus) to resync. Without this, the UI goes stale after any network blip.
⚠️ [RISK: Zustand] Do not put derived state (computed values) in the store. Compute global best, commit rate, etc. inline in the component or via selectors. Store holds raw data only.
⚠️ [Session 3 scar] SSE event format is `event: <type>\ndata: <json>\n\n`. EventSource dispatches named events — use `eventSource.addEventListener('<type>', handler)` not `onmessage` (which only catches unnamed events).
⚠️ [Known gotcha] `"use client"` must be the very first line in client components. Cannot be inside a server component module.
⚠️ [Known gotcha] Tailwind 4: class-based dark mode is the default. No need for `darkMode: 'class'` in config. But verify `dark:` prefix works.
⚠️ [Known gotcha] JetBrains Mono: the font must be applied via CSS on the body or root, AND explicitly on any SVG `<text>` elements (SVG doesn't inherit font-family from CSS by default in all browsers — use `fontFamily` attribute).

## Constraints
- All components use Tailwind classes for styling. CSS custom properties (`var(--color-*)`) for theme colors.
- No inline `style={}` objects except inside SVG elements (Tailwind can't style SVG attributes).
- Session cards must be keyboard-navigable (focus ring, Enter to select).
- Sparkline renders client-side only (no SSR for SVG with dynamic data).
- No `useEffect` for data that can be derived from store (use Zustand selectors or inline computation).

## Verification Gates
Run these after completion. All must pass.
- `pnpm build` — exits 0
- `npx tsc --noEmit` — exits 0
- Open `http://localhost:3100` — dark background renders, JetBrains Mono font loads, header visible
- Sidebar is 340px wide, scrolls independently
- If API has sessions (from session 3 gate tests): cards render with status badges
- If no sessions: main content area shows "SELECT A SESSION" placeholder
- GPU bar renders (empty array = "No GPUs detected" message)
- Browser DevTools Network tab: EventSource connection to /api/stream established, heartbeats arriving
- Disconnect server, wait 5s, restart → UI shows reconnecting, then recovers data
- `grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l` — expect 0

## Regression Gates
- Session 1: `pnpm build` exits 0
- Session 1: `curl -sf http://localhost:3100/api/health | jq .status` — "ok"
- Session 3: `curl -sf http://localhost:3100/api/sessions` — returns array
- Session 3: `curl -N -sf http://localhost:3100/api/stream &` — heartbeats arrive
