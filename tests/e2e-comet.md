# Autoresearch Mission Control — E2E Test Plan

**App URL:** http://192.168.178.29:3200
**Type:** Next.js 15 web app (dark theme, single-page dashboard)
**Purpose:** Real-time monitoring dashboard for concurrent ML research experiments

## App Overview

This is a self-hosted dashboard that monitors automated research sessions. Currently it has one active session called "docboost-f1-optimization" which tracks F1 score optimization (higher is better) across 39 experiments. The app uses SSE for real-time updates, Zustand for client state, D3.js for charts, and SQLite for persistence.

---

## TEST SUITE 1: Page Load & Initial Render

### T1.1 — Dashboard loads without errors
1. Navigate to http://192.168.178.29:3200
2. Verify the page loads without console errors
3. Verify the header shows "AUTORESEARCH MISSION CONTROL" (or "AUTORESEARCH" on mobile)
4. Verify there is a green connection dot (indicating SSE is connected)
5. Verify no loading spinners are stuck indefinitely

### T1.2 — Stats bar displays correct data
1. Verify stats bar shows 4 metrics: SESSIONS, EXPERIMENTS, GLOBAL BEST F1, COMMIT RATE
2. Verify SESSIONS shows a value like "1/1" (running/total)
3. Verify EXPERIMENTS shows "39"
4. Verify GLOBAL BEST F1 shows "67.9%" (the best F1 value)
5. Verify COMMIT RATE shows a percentage value (should be ~25.6% = 10/39)

### T1.3 — Session list loads in sidebar
1. Verify the left sidebar shows "Sessions (1)" header
2. Verify there is one session card with tag "docboost-f1-optimization"
3. Verify the card shows a status badge (should show "running")
4. Verify the card shows "Claude" as the agent type
5. Verify the card shows "BEST F1 67.9%"
6. Verify the card shows "RUNS 39"
7. Verify the card shows a sparkline chart (small line chart with data points)

### T1.4 — Font and theme
1. Verify the page uses a monospace font (JetBrains Mono)
2. Verify the background is very dark (near black, #020617)
3. Verify text colors are light (white/gray shades)
4. Verify accent colors are cyan/teal for highlighted elements

---

## TEST SUITE 2: API Endpoints

### T2.1 — GET /api/sessions
1. Fetch http://192.168.178.29:3200/api/sessions
2. Verify response is JSON array with at least 1 session
3. Verify each session has fields: id, tag, status, agent_type, strategy, metric_name, metric_direction
4. Verify the docboost session has metric_name="f1_pct" and metric_direction="higher"
5. Verify best_val_bpb is approximately 67.88

### T2.2 — GET /api/sessions/[id]
1. Get the session ID from T2.1 (should be "docboost-main")
2. Fetch http://192.168.178.29:3200/api/sessions/docboost-main
3. Verify response includes session data plus experiments array
4. Verify experiments array has 39 items
5. Verify experiments are sorted by run_number ascending

### T2.3 — GET /api/sessions/[id]/experiments
1. Fetch http://192.168.178.29:3200/api/sessions/docboost-main/experiments?limit=5&offset=0
2. Verify response has { experiments: [...], total: 39 }
3. Verify experiments array has 5 items (respecting limit)
4. Verify each experiment has: id, session_id, run_number, val_bpb, committed, change_summary
5. Verify first experiment has run_number=1 and val_bpb around 30.77

### T2.4 — GET /api/sessions/[id]/experiments with pagination
1. Fetch with offset=35&limit=10
2. Verify experiments array has 4 items (39 total - 35 offset = 4 remaining)
3. Verify run_numbers are 36, 37, 38, 39

### T2.5 — GET /api/health
1. Fetch http://192.168.178.29:3200/api/health
2. Verify response has { status: "ok", sessions: { running: N, total: N }, uptime_s: N }
3. Verify status is "ok"

### T2.6 — GET /api/gpus
1. Fetch http://192.168.178.29:3200/api/gpus
2. Verify response is JSON array (may be empty if no GPU detected)
3. If GPUs are present, verify each has: index, name, memory_total_mb, utilization_pct

### T2.7 — GET /api/stream (SSE)
1. Open EventSource to http://192.168.178.29:3200/api/stream
2. Verify connection is established (HTTP 200 with Content-Type: text/event-stream)
3. Wait up to 20 seconds
4. Verify at least one "heartbeat" event is received (sent every 15s)
5. Verify event format: `event: heartbeat\ndata: {"type":"heartbeat"}\n\n`

### T2.8 — POST /api/sessions validation
1. POST to /api/sessions with empty body — expect 400 error
2. POST with { tag: "A", agent_type: "claude-code", strategy: "test" } — expect 400 (tag too short, must be lowercase)
3. POST with { tag: "valid-tag", agent_type: "invalid-agent", strategy: "test" } — expect 400 (invalid agent)
4. POST with { tag: "valid-tag", agent_type: "claude-code", strategy: "" } — expect 400 (empty strategy)

### T2.9 — GET /api/sessions/nonexistent
1. Fetch http://192.168.178.29:3200/api/sessions/nonexistent-id
2. Verify response is 404

---

## TEST SUITE 3: Session Card Interaction

### T3.1 — Select session by click
1. Click the "docboost-f1-optimization" session card in the sidebar
2. Verify the card gets a cyan/accent left border (selected state)
3. Verify the main content area shows the session detail view
4. Verify the session detail shows "docboost-f1-optimization" as the title

### T3.2 — Select session by keyboard
1. Tab to the session card (should be focusable, role="button")
2. Press Enter
3. Verify the same selection behavior as T3.1

### T3.3 — Compare toggle button
1. Find the small diamond/compare icon button on the session card
2. Click it
3. Verify the icon turns yellow/orange (comparing state)
4. Verify clicking it again toggles it back to muted color

### T3.4 — Session card data accuracy
1. Verify the sparkline SVG renders with data points (not empty or flat line)
2. Verify HIT rate percentage is displayed and is a valid number
3. Verify the strategy text is truncated with "..." if longer than 60 characters

---

## TEST SUITE 4: Session Detail View

### T4.1 — Detail header
1. Select the docboost session
2. Verify header shows tag "docboost-f1-optimization"
3. Verify status badge shows "running" with a pulsing dot animation
4. Verify agent type shows "Claude Code"
5. Verify branch name is displayed in a rounded badge

### T4.2 — Metrics grid
1. Verify "BEST F1" metric shows "67.9%" (formatted as percentage, not raw decimal)
2. Verify "EXPERIMENTS" shows "39"
3. Verify "COMMITTED" shows "10"
4. Verify "HIT RATE" shows approximately "26%" (10/39)
5. Verify "AVG DELTA" shows a value (formatted with % suffix for F1 metric)

### T4.3 — Experiment timeline
1. Verify an SVG chart is rendered with circles for each experiment
2. Verify committed experiments have larger/filled circles
3. Verify discarded experiments have smaller/hollow circles
4. Verify one circle has an orange/gold ring (the best experiment)
5. Verify the chart is horizontally scrollable if experiments overflow
6. Verify a legend is shown below: "committed", "discarded", "best"

### T4.4 — Commit feed
1. Verify a list of recent committed experiments is shown
2. Verify each entry shows: delta value, change summary text, run number
3. Verify deltas are color-coded (green for good improvements)
4. Verify at most 8 entries are shown

### T4.5 — Code heatmap
1. Verify horizontal bars are rendered for code regions
2. Verify each region has a label and fill percentage
3. Verify colors range from cyan to orange to red based on heat

### T4.6 — Action buttons
1. Verify a "Pause" button is visible (since session is "running")
2. Verify a "Fork" button is visible (since experiments exist)
3. Verify a "Kill" button is visible
4. **Do NOT click Kill** — just verify it exists

### T4.7 — Strategy display
1. Verify the full strategy text is shown in a bordered box
2. Verify it mentions "Optimize docboost F1 score" or similar content

---

## TEST SUITE 5: New Session Modal

### T5.1 — Open modal
1. Click the "New Session" button in the header
2. Verify a modal overlay appears with a dark backdrop
3. Verify the modal title is "New Session"
4. Verify the tag input is auto-focused

### T5.2 — Close modal with ESC
1. Open the modal
2. Press Escape key
3. Verify the modal closes
4. Verify the backdrop is removed

### T5.3 — Close modal with backdrop click
1. Open the modal
2. Click the dark backdrop area (outside the modal form)
3. Verify the modal closes

### T5.4 — Form validation — empty submit
1. Open the modal
2. Clear all fields
3. Click the submit/Create button
4. Verify error messages appear for required fields (tag, strategy)

### T5.5 — Form validation — invalid tag
1. Open the modal
2. Enter tag "A" (too short)
3. Try to submit
4. Verify an error message about tag format appears

### T5.6 — Form validation — tag with uppercase
1. Enter tag "MySession"
2. Try to submit
3. Verify tag validation error (must be lowercase alphanumeric + hyphens)

### T5.7 — Form fields present
1. Verify Tag input field exists (text input)
2. Verify Agent Type dropdown exists with options: Claude Code, Codex, Aider, Gemini CLI
3. Verify Strategy textarea exists
4. Verify GPU Index field exists (defaults to "auto")

### T5.8 — Agent type dropdown
1. Click the agent type dropdown
2. Verify all 4 options are listed
3. Select "Codex"
4. Verify the selection is reflected in the dropdown

---

## TEST SUITE 6: Comparison View

### T6.1 — Empty comparison state
1. Click the "Compare" button in the header
2. Verify the view switches to comparison mode
3. If no sessions are toggled for comparison, verify message: "Toggle sessions with ... in the sidebar to compare"

### T6.2 — Add session to comparison
1. Click the compare icon on the docboost session card (sidebar)
2. Switch to Compare view
3. Verify the comparison table appears with the session data
4. Verify the ProgressChart (D3 multi-line chart) renders

### T6.3 — Comparison table columns
1. With session in comparison view, verify these columns exist:
   - Session (tag name)
   - Agent
   - Experiments (count)
   - Commits (count)
   - Hit Rate (%)
   - Best F1 (metric value, formatted as percentage)
   - Delta Best (improvement from baseline)
   - Duration

### T6.4 — Sortable headers
1. Click the "Experiments" column header
2. Verify an up arrow (ascending) appears
3. Click the same header again
4. Verify arrow toggles to down (descending)
5. Click "Best F1" header
6. Verify sorting switches to that column

### T6.5 — Progress chart renders
1. Verify a D3 SVG chart is visible
2. Verify it has Y-axis labels (F1 percentages like "30%", "50%", "67%")
3. Verify it has X-axis labels (experiment numbers)
4. Verify the Y-axis label says "F1" (not "val_bpb")
5. Verify at least one colored line with data points is drawn

---

## TEST SUITE 7: View Navigation

### T7.1 — Dashboard/Compare toggle
1. Click "Dashboard" button — verify dashboard view is shown
2. Click "Compare" button — verify comparison view is shown
3. Click "Dashboard" again — verify it switches back
4. Verify the active button has a highlighted/accent background

### T7.2 — Empty dashboard state
1. If possible, deselect all sessions (click selected session again or select null)
2. Verify the main area shows "Select a Session" empty state message

### T7.3 — View persistence on session select
1. Be in Compare view
2. Click a session card in the sidebar
3. Verify the view switches to Dashboard (detail view for selected session)

---

## TEST SUITE 8: Responsive Design

### T8.1 — Desktop layout (>1024px)
1. Set viewport to 1440x900
2. Verify sidebar is visible on the left (~340px width)
3. Verify main content fills remaining space
4. Verify header shows full "AUTORESEARCH MISSION CONTROL" text
5. Verify view toggle buttons are visible
6. Verify "New Session" text (not just "New")

### T8.2 — Tablet layout (~768px)
1. Set viewport to 768x1024
2. Verify layout adjusts appropriately
3. Verify content is readable and not overflowing

### T8.3 — Mobile layout (<640px)
1. Set viewport to 375x812 (iPhone)
2. Verify sidebar is hidden by default
3. Verify a hamburger menu icon is visible
4. Click the hamburger — verify sidebar slides in as overlay
5. Verify "MISSION CONTROL" text is hidden, only "AUTORESEARCH" shows
6. Verify "New Session" button shows as just "New"
7. Select a session — verify the overlay closes and detail view shows

---

## TEST SUITE 9: Real-time Updates (SSE)

### T9.1 — Connection indicator
1. Load the page
2. Verify the green dot appears next to the logo (connected state)
3. The dot should be solid green, not red

### T9.2 — Heartbeat keeps connection alive
1. Open browser DevTools > Network tab
2. Find the EventSource connection to /api/stream
3. Wait 15-20 seconds
4. Verify heartbeat events are being received periodically

---

## TEST SUITE 10: Data Correctness

### T10.1 — Metric direction for F1 (higher is better)
1. In the session card, verify "BEST F1" shows 67.9% (not a raw 0.xxxx BPB format)
2. In session detail, verify "BEST F1" metric is formatted as percentage
3. In the sparkline, verify the best data point (gold ring) is near the TOP of the chart (higher=better means up=better)
4. In the progress chart, verify the Y-axis goes upward for better values

### T10.2 — Experiment data integrity
1. Fetch /api/sessions/docboost-main/experiments?limit=100
2. Verify run_numbers are sequential (1, 2, 3, ... 39)
3. Verify val_bpb values are between 0 and 100 (F1 percentages)
4. Verify exactly 10 experiments have committed=1
5. Verify each committed experiment (except possibly the first) has committed=1 only when its val_bpb is higher than all previous values

### T10.3 — Best value accuracy
1. From the experiments API, find the maximum val_bpb across all 39 experiments
2. Verify it matches the session's best_val_bpb (67.88)
3. Verify the UI displays this as "67.9%"

### T10.4 — Stats bar consistency
1. Count sessions from /api/sessions — verify SESSIONS stat matches
2. Sum experiment_count across sessions — verify EXPERIMENTS stat matches
3. Sum commit_count / experiment_count — verify COMMIT RATE matches
4. Find best best_val_bpb across sessions — verify GLOBAL BEST matches

---

## TEST SUITE 11: Error Handling

### T11.1 — 404 API response
1. Fetch /api/sessions/nonexistent-session-id
2. Verify 404 status code
3. Verify response body has error message

### T11.2 — Invalid API input
1. POST /api/sessions with body: { tag: "!!!", agent_type: "claude-code", strategy: "test" }
2. Verify 400 status code with validation error message

### T11.3 — Error boundary in UI
1. If any component throws a rendering error, verify an error boundary catches it
2. Verify a "Retry" button is shown (not a blank white page)

---

## TEST SUITE 12: Accessibility

### T12.1 — Keyboard navigation
1. Verify Tab key moves focus through interactive elements
2. Verify session cards have role="button" and tabIndex={0}
3. Verify Enter and Space activate focused session cards
4. Verify ESC closes the modal

### T12.2 — Focus indicators
1. Tab to a session card
2. Verify a visible focus ring appears (focus-visible:ring)
3. Tab to buttons
4. Verify focus indicators are visible

### T12.3 — Color contrast
1. Verify text on dark background has sufficient contrast
2. Verify status badges are distinguishable (not relying on color alone — they have text labels)

---

## TEST SUITE 13: Charts & SVG Rendering

### T13.1 — Sparkline in session card
1. Verify the sparkline SVG element exists (280x28 viewport)
2. Verify it contains a polyline element (the line)
3. Verify it contains circle elements (data points)
4. Verify one circle has a stroke color matching the warning/gold color (best marker)

### T13.2 — Experiment timeline in detail view
1. Verify the SVG is rendered inside a scrollable container
2. Verify the number of circle elements roughly matches experiment count
3. Verify best experiment has an orange ring (larger circle with stroke, no fill)

### T13.3 — Progress chart in comparison view
1. Add a session to comparison and switch to Compare view
2. Verify the D3 chart SVG is rendered
3. Verify it has text elements for axis labels
4. Verify it has a path element (the line)
5. Verify the Y-axis label text is "F1" (metric-aware label)

---

## SUMMARY

| Suite | Tests | Priority |
|-------|-------|----------|
| 1. Page Load | 4 | Critical |
| 2. API Endpoints | 9 | Critical |
| 3. Session Card | 4 | High |
| 4. Session Detail | 7 | High |
| 5. New Session Modal | 8 | High |
| 6. Comparison View | 5 | Medium |
| 7. View Navigation | 3 | Medium |
| 8. Responsive Design | 3 | Medium |
| 9. Real-time (SSE) | 2 | High |
| 10. Data Correctness | 4 | Critical |
| 11. Error Handling | 3 | Medium |
| 12. Accessibility | 3 | Low |
| 13. Charts & SVG | 3 | Medium |
| **TOTAL** | **58** | |
