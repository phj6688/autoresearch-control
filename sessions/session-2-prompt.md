# FORGE Session 2: Backend Core — Git, Process Manager, GPU, Watcher
Project: AUTORESEARCH MISSION CONTROL
Spec: TASKSPEC.md
Previous sessions completed: 1 (Foundation)

## Mission (this session)
Build all server-side library modules that manage the physical infrastructure: git worktrees, tmux agent processes, GPU discovery, results.tsv parsing, file watching, and log tailing. These are the muscles the API routes (session 3) will call.

## Deliverables
- [ ] `src/lib/git.ts`:
  - `createWorktree(repoPath: string, worktreeDir: string, tag: string): Promise<string>` — runs `git worktree add <worktreeDir>/<tag> -b autoresearch/<tag> master`, returns worktree path
  - `deleteWorktree(repoPath: string, worktreePath: string): Promise<void>` — `git worktree remove <path>`
  - `listWorktrees(repoPath: string): Promise<WorktreeInfo[]>` — parse `git worktree list --porcelain`
  - `getBranchLog(worktreePath: string, limit?: number): Promise<GitCommit[]>` — `git log --oneline -n <limit>`
  - `getBestCommitHash(worktreePath: string, experiments: Experiment[]): string | null` — find commit at best val_bpb
  - `seedTrainPy(sourceWorktree: string, targetWorktree: string): Promise<void>` — copy train.py, git add, git commit
  - `getCommitDiffStats(worktreePath: string, hash: string): Promise<DiffStat>` — `git diff --stat <hash>~1 <hash>` for mutation heatmap
  - All git operations serialized per-repo via a simple async mutex (no concurrent git on same repo)
  - All commands use `simple-git` bound to the correct working directory
  - Error handling: wrap every operation, throw typed errors (GitWorktreeError, GitBranchError)

- [ ] `src/lib/process-manager.ts`:
  - `spawnSession(config: SpawnConfig): Promise<string>` — creates tmux session, sends agent command, returns tmux session name
    - SpawnConfig: `{ tag, worktreePath, gpuIndex, agentType, agentCommand?, programMd }`
    - Writes `program.md` into worktree before spawning
    - Sets `CUDA_VISIBLE_DEVICES=<gpuIndex>` in tmux environment
    - tmux session name: `autoresearch-<tag>`
    - Agent commands by type:
      - claude-code: `claude --model claude-opus-4-6 --print "Read program.md and begin. Setup first, then run experiments continuously."`
      - codex: `codex --model o4-mini --auto-edit --full-auto`
      - aider: `aider --model claude-3.5-sonnet train.py`
      - custom: `<agentCommand>`
  - `pauseSession(tmuxName: string): Promise<void>` — `tmux send-keys -t <name> '' && kill -STOP $(tmux list-panes -t <name> -F '#{pane_pid}')` — SIGSTOP to the pane process group
  - `resumeSession(tmuxName: string): Promise<void>` — SIGCONT to pane PID
  - `killSession(tmuxName: string): Promise<void>` — SIGTERM, wait 5s, check if alive, SIGKILL if needed, then `tmux kill-session`
  - `isSessionAlive(tmuxName: string): Promise<boolean>` — `tmux has-session -t <name>`
  - `getSessionPid(tmuxName: string): Promise<number | null>` — `tmux list-panes -t <name> -F '#{pane_pid}'`
  - All tmux commands via `child_process.execFile` (not exec — no shell injection)
  - Error: if tmux not installed, throw `ProcessManagerError('tmux not found')`

- [ ] `src/lib/gpu.ts`:
  - `getGpuStatus(): Promise<GpuInfo[]>` — parse `nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits`
  - `findFreeGpu(assignedGpus: number[]): number | null` — returns first GPU index not in assigned list
  - Graceful fallback: if nvidia-smi not found, return empty array (not throw)
  - Parse defensively: skip lines that don't match expected format
  - Timeout: 5s timeout on nvidia-smi execution

- [ ] `src/lib/results-parser.ts`:
  - `parseResultsTsv(content: string): Experiment[]` — parse TSV with headers: run_number, tag, description, val_bpb, peak_vram_mb
  - Skip header row, skip malformed rows (log warning, don't throw)
  - Return typed Experiment[] (without session_id — caller sets that)
  - Handle partial writes: if last line doesn't parse, skip it

- [ ] `src/lib/watcher.ts`:
  - `watchSession(sessionId: string, worktreePath: string, onExperiment: (exp) => void): WatcherHandle`
  - Watches `<worktreePath>/results.tsv` for changes using `fs.watch` with 500ms debounce
  - On change: read file, parse, diff against last known state, emit only new experiments
  - Returns `WatcherHandle` with `.stop()` method for cleanup
  - Tracks last known experiment count per session to avoid re-emitting

- [ ] `src/lib/log-tailer.ts`:
  - `tailRunLog(worktreePath: string, lines?: number): Promise<string>` — read last N lines (default 20) of `run.log`
  - `detectExperimentStatus(logContent: string): 'training' | 'evaluating' | 'idle' | 'error'` — regex on log patterns
  - Non-blocking: if file doesn't exist, return empty string

- [ ] Add types to `src/lib/types.ts` as needed:
  - `SpawnConfig`, `WatcherHandle`, `GitCommit`, `WorktreeInfo`, `DiffStat`, `ProcessManagerError`, `GitWorktreeError`

## Scar Load — Do Not Repeat
⚠️ [RISK: process-manager] SIGSTOP must target the process group, not just the pane PID. Use `kill -STOP -<pgid>` to suspend the entire tree including the GPU-holding training process. Test this explicitly.
⚠️ [RISK: git.ts] Concurrent git operations on the same repo cause "fatal: Unable to create '.git/index.lock'". Serialize ALL git operations through an async mutex.
⚠️ [RISK: watcher] fs.watch fires duplicate events. Debounce with 500ms delay. Also: fs.watch is not recursive by default — watch the specific file, not the directory.
⚠️ [Known gotcha] `child_process.exec` is a shell injection surface. Use `execFile` (array args) for ALL subprocess calls. Never interpolate user input into shell strings.
⚠️ [RISK: nvidia-smi] Output format varies. Don't assume column count. Parse each field individually, skip rows that don't match.
⚠️ [Known gotcha] simple-git's async operations return Promises but git locks are per-repo. Even with await, rapid sequential calls can hit lock contention. The mutex solves this.

## Constraints
- No `console.log`. Use a simple logger if needed: `const log = { info: (...args) => {}, warn: (...args) => {}, error: (...args) => {} }` (no-op in this session, wired later).
- All subprocess calls via `execFile`, never `exec`.
- `simple-git` instances created per-worktree, not shared.
- Every function that touches the filesystem must handle ENOENT gracefully.
- No hardcoded paths. Everything from env or function parameters.

## Verification Gates
Run these after completion. All must pass.
- `npx tsc --noEmit` — exits 0
- `grep -rn "child_process.*exec[^F]" src/lib/ --include="*.ts" | wc -l` — expect 0 (no exec, only execFile)
- `grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l` — expect 0
- `grep -rn "any" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".d.ts" | wc -l` — expect 0
- Create a test script that: imports results-parser, parses a sample TSV string, asserts array length and types — exits 0
- Create a test script that: imports gpu.ts, calls getGpuStatus, handles nvidia-smi not found gracefully — exits 0

## Regression Gates
- Session 1: `pnpm build` exits 0
- Session 1: `curl -sf http://localhost:3100/api/health | jq .status` — "ok"
- Session 1: `npx tsc --noEmit` — exits 0
