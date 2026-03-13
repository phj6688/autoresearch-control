# Autoresearch Mission Control
Self-hosted web UI for managing multiple concurrent Karpathy autoresearch sessions.

## Commands
pnpm dev       # Dev server on :3100
pnpm build     # Production build
pnpm start     # Start production
pnpm typecheck # npx tsc --noEmit
pnpm lint      # eslint

## Code Style
TypeScript strict mode. No `any`. No `as` casts unless type-narrowing is provably safe.
All async errors caught — no unhandled promise rejections.
Server-side: explicit error responses with status codes, never throw raw.
Client-side: error boundaries on every route-level component.
Zustand stores: actions as separate functions, not inline in components.
D3 charts: render to SVG in useEffect with ref, not JSX (D3 owns the DOM in chart areas).
Tailwind: use CSS variables for theme colors, not hardcoded hex in className strings.

## Non-Negotiable Rules
- No `console.log` anywhere. Use structured logging or remove.
- All URLs from environment variables. No hardcoded `localhost`.
- `better-sqlite3` calls wrapped in try/catch. SQLite busy? Retry 3x, 100ms backoff.
- File watchers (`fs.watch`) must be cleaned up on session kill/delete. Leaked watchers = memory leak.
- tmux sessions prefixed `autoresearch-` to avoid collision with user tmux sessions.
- SSE endpoint must send heartbeat every 15s or the connection will be considered dead by proxies.
- Never delete git worktrees automatically. User data. Explicit delete only.
- GPU index from nvidia-smi is the source of truth. Never hardcode GPU count.
- `CUDA_VISIBLE_DEVICES` must be set per-session, not globally.

## Known Gotchas
- `NEXT_PUBLIC_*` vars baked at build time. All runtime config via server-side env only.
- `better-sqlite3` is native — needs node-gyp at build time in Docker. Use `node:22-bookworm` not alpine.
- `fs.watch` is unreliable on some Linux filesystems. Use `chokidar` if `fs.watch` misses events.
- `node-pty` requires native compilation. If not needed (tmux send-keys is sufficient), avoid it.
- `simple-git` operations are async but git itself holds locks. Never run concurrent git ops on same repo.
- SSE in Next.js App Router: return `new Response(stream)` with `ReadableStream`, not `res.write()`.
- tmux `send-keys` with special chars needs escaping. Always quote the full command string.
- `nvidia-smi` output format varies by driver version. Parse defensively.

## Session Hygiene
- /compact at ~50% context usage
- /clear between sessions
- grep-based verification preferred over manual inspection
- After every file creation: run `npx tsc --noEmit` to catch type errors early
- After every API route: test with curl before moving on
