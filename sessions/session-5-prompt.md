# FORGE Session 5: UI Detail — Session Detail, Charts, Timeline, Heatmap
Project: AUTORESEARCH MISSION CONTROL
Spec: TASKSPEC.md
Previous sessions completed: 1 (Foundation), 2 (Backend Core), 3 (API + SSE), 4 (UI Shell)

## Mission (this session)
Build the rich detail view: session detail panel with all sub-components (D3 progress chart, experiment timeline, commit feed, mutation heatmap), the comparison overlay view, and wire action buttons (pause, resume, kill, fork) to the API.

## Deliverables
- [ ] `src/components/session-detail.tsx`:
  - Rendered in the main content area when a session is selected and view is `dashboard`
  - **Header row**: session tag (large), status badge, agent name, branch name (purple), elapsed time, action buttons
  - **Action buttons**: Pause (if running), Resume (if paused), Kill (if running/paused), Fork (always, if has experiments)
    - Each button calls the appropriate API endpoint, updates Zustand on response
    - Kill: confirm dialog before executing ("Kill session <tag>? The worktree will be preserved.")
    - Fork: opens the New Session Modal (session 6) pre-filled with `seedFrom: session.id`
  - **Strategy block**: bordered box showing the session's strategy text
  - **Metrics row**: 5 metric cards in a flex row:
    - Best val_bpb (cyan, large font)
    - Experiment count (white)
    - Committed count (green)
    - Hit rate % (amber) — `(committed / total * 100).toFixed(0)`
    - Avg committed delta (purple) — mean delta of committed experiments
  - **Experiment timeline**: renders `<ExperimentTimeline />`
  - **Two-column row**: `<CommitFeed />` (flex-1) + `<CodeHeatmap />` (260px fixed)
  - **Cross-pollinate hint**: dashed border box at bottom with fork icon and instructional text

- [ ] `src/components/progress-chart.tsx`:
  - **D3-rendered SVG chart** for comparison view
  - Props: `sessions: Session[], experimentsBySession: Record<string, Experiment[]>`
  - Dimensions: 560×220px (responsive: recalculates on resize via ResizeObserver)
  - X axis: experiment number (0 to max across all sessions)
  - Y axis: val_bpb, auto-scaled with 0.005 padding on min/max
  - One polyline per session, unique color from palette: `['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb923c']`
  - Committed experiments: filled circle (r=2)
  - Best per session: gold ring (r=4, stroke #f59e0b)
  - Y grid lines (5 ticks), axis labels in JetBrains Mono
  - Session tag label at the end of each line
  - Axis titles: "experiment #" (bottom center), "val_bpb" (left, rotated)
  - **D3 pattern**: `useRef<SVGSVGElement>` + `useEffect` that calls D3 to manipulate the ref'd SVG. D3 owns the SVG children, React owns the container. Clear SVG children on re-render before D3 redraws.

- [ ] `src/components/experiment-timeline.tsx`:
  - Horizontal scrollable SVG
  - Props: `experiments: Experiment[], compact?: boolean`
  - Each experiment = circle dot, positioned:
    - X: evenly spaced, `spacing = compact ? 8 : 14` px
    - Y: mapped from val_bpb (higher bpb = higher Y = worse)
  - Committed: cyan filled, r=5 (or 3 if compact)
  - Discarded: gray (#334155), r=3 (or 2 if compact)
  - Best: gold ring outline
  - Auto-scroll to rightmost on new experiment (scroll container ref, `scrollLeft = scrollWidth`)
  - Legend below: ● committed, ● discarded, ○ best

- [ ] `src/components/commit-feed.tsx`:
  - Props: `experiments: Experiment[]` (pre-filtered to committed only, last 8, reversed)
  - Each row: delta value (color-coded: <-0.005 green, <-0.002 cyan, else muted), change summary text (truncated), experiment # badge
  - Compact list with subtle dividers

- [ ] `src/components/code-heatmap.tsx`:
  - Props: `sessionId: string` (fetches diff stats from API or derives from experiment data)
  - Renders mutation frequency per `train.py` code region:
    - Model Config (L1-45), Attention (L46-120), MLP/FFN (L121-180), Embeddings (L181-220), Optimizer (L221-350), LR Schedule (L351-400), Training Loop (L401-520), Eval/Logging (L521-630)
  - Each region: label + horizontal bar (width = heat 0-100%) + line range
  - Bar color gradient: low=blue, medium=orange, high=red
  - **Heat derivation**: for now, derive from change_summary keywords (model/attention/optimizer/etc.) counted across committed experiments. When git diff stats API is available, switch to that.
  - Header: "MUTATION HEATMAP — train.py"

- [ ] `src/components/comparison-view.tsx`:
  - Rendered when view is `compare`
  - Header: "SESSION COMPARISON" + count of compared sessions
  - Instructions: "Toggle sessions with ◆ in the sidebar"
  - `<ProgressChart />` with sessions filtered by `store.compareIds`
  - Comparison table below the chart:
    - Columns: Session, Agent, Experiments, Commits, Hit Rate, Best BPB, Δ from Baseline (0.998), Duration
    - Rows: one per compared session
    - Sortable: click column header to sort (local state, not stored)
    - Best BPB column: cyan, bold
    - Delta column: green for improvement

- [ ] Update `src/components/dashboard.tsx`:
  - Main content area renders:
    - If view=dashboard and selectedId: `<SessionDetail />`
    - If view=dashboard and no selectedId: empty state ("SELECT A SESSION" + hexagon icon)
    - If view=compare: `<ComparisonView />`
  - Wire up experiments data: when session selected, fetch experiments from `GET /api/sessions/<id>/experiments`

## Scar Load — Do Not Repeat
⚠️ [RISK: D3+React] D3 and React both want to own the DOM. Solution: D3 renders INSIDE a ref'd SVG element. React renders the container. On every data change, D3 clears all children (`d3.select(ref).selectAll('*').remove()`) and redraws. Never mix D3 selection manipulation with React JSX inside the same SVG.
⚠️ [RISK: chart performance] With >500 data points across multiple sessions, SVG rendering slows. If performance degrades: subsample to 1 point per 3 experiments for sessions with >200 experiments. But only if actually slow — don't prematurely optimize.
⚠️ [RISK: ResizeObserver] ResizeObserver callback fires synchronously on some browsers, causing layout thrash. Debounce resize handler by 100ms.
⚠️ [Session 4 scar] SVG text elements don't inherit CSS font-family reliably. Always set `fontFamily="'JetBrains Mono', monospace"` as an attribute on every `<text>` element.
⚠️ [Session 4 scar] SSE events update Zustand, which triggers re-renders. D3 charts that re-render on every experiment would be expensive. Use `useMemo` or `useRef` to track if data actually changed before triggering D3 redraw.
⚠️ [Known gotcha] `scrollLeft = scrollWidth` for auto-scroll must run AFTER the DOM updates. Use `useEffect` with experiments.length as dependency, with a `requestAnimationFrame` wrapper.

## Constraints
- D3 charts: NO inline React JSX inside the SVG. D3 owns everything below the `<svg>` ref.
- Sparklines (from session 4) stay as hand-crafted SVG JSX — they're simple enough. D3 is only for the large progress chart.
- Action buttons must show loading state during API call (disable button, show spinner or "...").
- Confirm dialog for Kill: use native `window.confirm()` — no custom modal needed for this.
- Code heatmap: keyword-based derivation for now. Comment the code clearly so it can be swapped for git diff stats later.

## Verification Gates
Run these after completion. All must pass.
- `pnpm build` — exits 0
- `npx tsc --noEmit` — exits 0
- Select a session in sidebar → detail view renders with: header, strategy block, metrics row, timeline, commit feed, heatmap
- Comparison: toggle ◆ on 2+ sessions → switch to COMPARE tab → overlay chart renders with distinct colored lines
- Comparison table renders with correct data, clickable headers sort rows
- Action test: if a running session exists, click Pause → status changes to paused, badge updates. Click Resume → running again.
- Fork button → (if new session modal exists from session 6, skip this; otherwise verify it calls the fork API)
- New experiment arrives via SSE → timeline scrolls right, sparkline updates, metrics update, commit feed updates if committed
- Resize browser window → chart redraws (no overflow, no cut-off)
- `grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l` — expect 0

## Regression Gates
- Session 1: health endpoint returns ok
- Session 3: `curl -sf http://localhost:3100/api/sessions` — returns array
- Session 3: SSE heartbeats arrive on /api/stream
- Session 4: dashboard layout renders with sidebar, header, stats bar
- Session 4: session cards with sparklines render in sidebar
