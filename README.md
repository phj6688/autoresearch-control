# FORGE Package: Autoresearch Mission Control

A complete FORGE-compliant spec + session prompt package for Claude Code to build a multi-session management UI for Karpathy's [autoresearch](https://github.com/karpathy/autoresearch).

## What's Inside

```
TASKSPEC.md                  ← Canonical spec (700+ lines, frozen during execution)
CLAUDE.md                    ← Agent rules (persistent across sessions)
AUDIT.md                     ← Greenfield Risk Speculation Report
.claude/settings.local.json  ← Tool permissions (full access)
sessions/
  session-1-prompt.md        ← Foundation: DB + types + scaffold
  session-2-prompt.md        ← Backend: git, tmux, GPU, watchers
  session-3-prompt.md        ← API routes + SSE
  session-4-prompt.md        ← UI shell: layout, sidebar, cards
  session-5-prompt.md        ← UI detail: charts, timeline, heatmap
  session-6-prompt.md        ← Modal + Telegram + Docker + polish
bootstrap.sh                 ← One-command project init
```

## Execution Protocol

### Prerequisites
- Machine with NVIDIA GPU (for full functionality; UI still works without one)
- Cloned autoresearch repo: `git clone https://github.com/karpathy/autoresearch`
- Node.js 22+, pnpm 9+, tmux, git
- Claude Code: `claude --model claude-opus-4-6`

### Steps

```bash
# 1. Bootstrap
chmod +x bootstrap.sh && ./bootstrap.sh
cd autoresearch-control

# 2. Launch Claude Code
claude --model claude-opus-4-6

# 3. Execute sessions sequentially
#    Paste session-1-prompt.md → build → verify gates → /clear
#    Paste session-2-prompt.md → build → verify gates → /clear
#    ... repeat through session 6

# 4. After all sessions pass:
docker compose up -d
```

### Between Sessions
- `/compact` at ~50% context usage within a session
- `/clear` between every session (clean slate)
- **YOU** run the verification gates — not the agent
- If a gate fails: stop, diagnose, give corrective prompt, re-verify

### If Something Breaks Mid-Session

Paste this format into Claude Code:
```
STOP. [Exact error output].
Root cause: [what you think caused it].
Fix: [what needs to change].
Verify: [specific command that must pass before continuing].
Do not touch anything else.
```

### If the Spec Is Wrong

Don't edit TASKSPEC.md directly during execution. Instead:
1. Stop execution
2. Add `## ADDENDUM — SPEC CORRECTION [date]` to TASKSPEC.md
3. Regenerate affected session prompts
4. Re-execute from the correction point

## Estimated Execution Time

| Session | Estimated Time | Complexity |
|---------|---------------|------------|
| 1. Foundation | 15-20 min | Simple |
| 2. Backend Core | 30-40 min | Complex (process mgmt) |
| 3. API Routes | 25-35 min | Moderate |
| 4. UI Shell | 25-35 min | Moderate |
| 5. UI Detail | 35-45 min | Complex (D3 charts) |
| 6. Polish + Docker | 30-40 min | Moderate |
| **Total** | **~3-4 hours** | |

## Architecture Summary

```
Browser → Next.js (SSR + API) → SQLite (metadata)
                                  ↓
                            tmux sessions → Claude Code / Codex / Aider agents
                                  ↓
                            git worktrees → train.py modifications
                                  ↓
                            results.tsv → fs.watch → SSE → Browser
                                  ↓
                            nvidia-smi → GPU status → Browser
```
