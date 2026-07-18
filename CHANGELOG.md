# Changelog

## Unreleased

### Removed
- Dead docboost import path: `docboost-watcher.ts` and `scripts/import-docboost.ts` pointed at
  `/home/lumo/docboost`, an account and mount removed in the 2026-07 host reorg. The watcher was
  auto-started by an unauthenticated `GET /api/stream` and watched nothing real (HLB-723).
- `log-tailer.ts`: module with zero importers.
- The `gpu-update` SSE event: declared in the `SSEEvent` union and listened for on the client, but
  never broadcast by the server. GPU refresh happens via the 10s poll; the dead wiring is gone.
- Committed FORGE workflow artifacts (`AUDIT.md`, `TASKSPEC.md`, `EXECUTION-GUIDE.md`,
  `sessions/*-prompt.md`), now gitignored as local-only per the artifact-hygiene convention.
