# FORGE Session 1: Foundation — DB + Types + Project Scaffold
Project: AUTORESEARCH MISSION CONTROL
Spec: TASKSPEC.md
Previous sessions completed: none

## Mission (this session)
Initialize the Next.js 15 project with all dependencies, TypeScript types, SQLite schema, root layout with dark theme and JetBrains Mono, and a working health endpoint. This is the structural foundation everything else builds on.

## Deliverables
- [ ] Next.js 15 project initialized with App Router, Tailwind 4, TypeScript strict mode
- [ ] `src/lib/types.ts` — all TypeScript interfaces/types matching the TASKSPEC data model exactly:
  - `Session`, `SessionStatus`, `Experiment`, `GpuInfo`, `GpuAssignment`, `Alert`, `AlertType`
  - `SSEEvent` union type (experiment, session-status, gpu-update, alert, heartbeat)
  - `CreateSessionInput`, `PatchSessionInput`, `ForkSessionInput` — API input types
- [ ] `src/lib/db.ts`:
  - SQLite connection singleton (WAL mode enabled)
  - Schema creation (all 4 tables from TASKSPEC: sessions, experiments, gpu_assignments, alerts)
  - Schema runs on import (CREATE TABLE IF NOT EXISTS)
  - Basic CRUD helpers: `getSession(id)`, `listSessions()`, `insertSession(input)`, `updateSession(id, fields)`, `deleteSession(id)`, `insertExperiment(exp)`, `getExperiments(sessionId, offset?, limit?)`
  - All helpers return typed results matching `types.ts`
  - Retry wrapper: 3 attempts, 100ms backoff on SQLITE_BUSY
- [ ] `src/app/layout.tsx`:
  - Root layout with `<html lang="en" className="dark">` 
  - JetBrains Mono loaded via `next/font/local` from `public/fonts/` (4 weights: 300, 400, 600, 700)
  - `<body>` styled with bg-[#020617] text-[#e2e8f0]
  - Metadata: title "Autoresearch Mission Control"
- [ ] `src/app/globals.css`:
  - Tailwind directives (@tailwind base, components, utilities)
  - CSS custom properties for all theme colors from TASKSPEC UI Design section
  - Custom scrollbar styles (thin, dark)
  - `@keyframes pulse` for status badge animation
- [ ] `src/app/api/health/route.ts`:
  - GET handler returning `{ status: "ok", uptime_s: process.uptime() }`
  - Later sessions will enrich this with session/GPU counts
- [ ] `.env.example` with all env vars from TASKSPEC documented with comments
- [ ] `package.json` with these exact dependencies:
  - next, react, react-dom (latest stable)
  - better-sqlite3, @types/better-sqlite3
  - simple-git
  - nanoid (for session IDs)
  - zustand
  - d3, @types/d3
  - tailwindcss, @tailwindcss/postcss (Tailwind 4)
  - typescript, @types/node, @types/react
- [ ] `next.config.ts` with `serverExternalPackages: ['better-sqlite3']`
- [ ] `tsconfig.json` with strict: true, paths alias `@/*` → `src/*`
- [ ] `tailwind.config.ts` configured for content paths

## Scar Load — Do Not Repeat
⚠️ [RISK: db.ts] SQLite without WAL mode causes "database is locked" under concurrent access. Enable WAL mode immediately after connection: `db.pragma('journal_mode = WAL')`.
⚠️ [RISK: Docker prep] better-sqlite3 is a native module. Do NOT use alpine base image in Docker later. Use `node:22-bookworm`. Start with `serverExternalPackages` in next.config.ts now.
⚠️ [Known gotcha] `NEXT_PUBLIC_*` vars are baked at build time. Do not create any `NEXT_PUBLIC_*` vars. All config is server-side env only.
⚠️ [Known gotcha] TypeScript `any` — never use it. If a type is unknown, define it explicitly or use `unknown` with type guards.

## Constraints
- TypeScript strict mode. Zero `any`. Zero `as` casts without type narrowing.
- No `console.log` anywhere. Remove or don't add.
- JetBrains Mono font files: download woff2 from Google Fonts and place in `public/fonts/`. Do NOT use Google Fonts CDN link.
- All colors as CSS custom properties in globals.css. Components reference `var(--color-*)`, mapped to Tailwind via config.
- Port default: 3100 (set in `.env.example` and `package.json` dev script)

## Verification Gates
Run these after completion. All must pass.
- `pnpm install && pnpm build` — exits 0, no warnings
- `npx tsc --noEmit` — exits 0
- `PORT=3100 pnpm start & sleep 3 && curl -sf http://localhost:3100/api/health | jq .status` — outputs "ok"
- `sqlite3 data/autoresearch.db ".tables"` — shows: alerts experiments gpu_assignments sessions
- `sqlite3 data/autoresearch.db ".schema sessions"` — shows CREATE TABLE with all columns from TASKSPEC
- `grep -rn "any" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".d.ts" | wc -l` — expect 0
- `grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" | wc -l` — expect 0

## Regression Gates
n/a — first session
