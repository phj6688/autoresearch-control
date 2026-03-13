#!/usr/bin/env bash
set -euo pipefail

# FORGE Bootstrap for Autoresearch Mission Control
# Run this from wherever you want the project to live.

PROJECT_DIR="autoresearch-control"

if [ -d "$PROJECT_DIR" ]; then
  echo "ERROR: $PROJECT_DIR already exists. Delete it or choose a different location."
  exit 1
fi

echo "=== FORGE: Autoresearch Mission Control ==="
echo "Creating project structure..."

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Copy FORGE documents
# (Assumes this script lives alongside TASKSPEC.md, CLAUDE.md, AUDIT.md, sessions/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp "$SCRIPT_DIR/TASKSPEC.md" .
cp "$SCRIPT_DIR/CLAUDE.md" .
cp "$SCRIPT_DIR/AUDIT.md" .
mkdir -p .claude
cp "$SCRIPT_DIR/.claude/settings.local.json" .claude/
mkdir -p sessions
cp "$SCRIPT_DIR/sessions/"*.md sessions/

# Initialize git
git init
git add .
git commit -m "FORGE: initial spec + session prompts"

echo ""
echo "=== Structure ==="
find . -type f | head -20
echo ""
echo "=== Ready ==="
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_DIR"
echo "  2. Review TASKSPEC.md (make any adjustments before execution)"
echo "  3. Launch Claude Code: claude --model claude-opus-4-6"
echo "  4. Paste the contents of sessions/session-1-prompt.md"
echo "  5. After session 1 gates pass → /clear → paste session-2-prompt.md"
echo "  6. Repeat for all 6 sessions"
echo ""
echo "Session hygiene reminders:"
echo "  - /compact at ~50% context usage"
echo "  - /clear between every session"
echo "  - YOU run verification gates, not the agent"
echo "  - If a gate fails: STOP → diagnose → corrective prompt → re-verify"
echo ""
