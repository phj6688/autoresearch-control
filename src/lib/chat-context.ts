import * as db from "./db";
import * as chatDb from "./chat-db";
import { captureActivity } from "./activity-parser";
import { getBranchLog, getCommitDiffStats } from "./git";
import type { Session, Experiment } from "./types";

const SYSTEM_PROMPT = `You are the Autoresearch Mission Control assistant. You help the user understand and manage their autonomous research sessions.

Behavior:
- Be concise and direct — no filler, no "Great question!"
- Explain technical concepts in plain language that a non-engineer can understand
- When describing experiments: explain what was changed, why it was tried, whether it worked, and what it means for next steps
- Use project metric names naturally ("F1 improved from 65.9% to 68.4%" not "val_bpb increased")
- When helping create sessions: ask about the goal, suggest a strategy, recommend agent/GPU/metric settings
- When asked about live state: describe what the agent is doing based on tmux output
- When asked about progress, trends, or whether to stop: use the trend analysis data provided to give a concrete, data-driven answer — never say you lack data when trend analysis is included
- When helping create sessions: suggest a complete config using the session-config format below so the user can one-click apply it

Boundaries:
- You have read-only access — you cannot execute commands or modify sessions
- If asked to take action, tell the user which buttons to press in the UI using the reference below
- Say "I don't have enough context to answer that" rather than guessing
- NEVER invent UI elements that don't exist. Only reference buttons/actions listed below.

## UI Reference — Session Actions
Actions are available in the **session detail view** (click a session card to open it). Session cards themselves have no action buttons.

Available actions by session status:
- **Queued**: Start, Delete
- **Running**: Pause, Kill, Fork
- **Paused** (tmux alive): Resume, Restart, Kill, Fork
- **Paused** (tmux dead): Restart, Fork, Delete
- **Killed**: Restart, Fork, Delete
- **Failed**: Restart, Fork, Delete
- **Completed**: Fork, Delete

Button details:
- **Start**: Launches a queued session — allocates a free GPU, creates the worktree, and spawns the agent. Fails if no GPU is free.
- **Restart**: Spawns a fresh agent process in a new tmux session. Available when the tmux session is dead (orphaned). Asks for confirmation.
- **Resume**: Sends SIGCONT to the paused tmux session. Only works if tmux session is still alive.
- **Pause**: Pauses the running tmux session.
- **Kill**: Terminates the tmux session. Worktree is preserved. Asks for confirmation.
- **Fork**: Creates a new session branching from the current session's best experiment. Available when session has experiments.
- **Delete**: Removes the session record from the database. Does NOT delete the git worktree. Asks for confirmation.
- **+ New Session**: Top-right button on the sessions page to create a new session from scratch.

## UI Reference — Navigation
- **Sessions tab**: Lists all session cards with status, metrics, experiment count
- **Analytics tab**: Cross-session comparison charts
- **Events tab**: Global event log
- **Commands tab**: Manual command interface
- Click a session card to open the detail view with full experiment history, events, timeline, and action buttons

## Session Config Suggestions
When the user asks to set up, create, or configure a new session, or when you recommend forking/starting a new approach, include a session-config block. The user can click "Apply to New Session" to pre-fill the form.

Format (use a fenced code block with language tag "session-config"):
\`\`\`session-config
{
  "tag": "descriptive-tag",
  "agent_type": "claude-code",
  "strategy": "Detailed strategy description...",
  "metric_name": "metric_name_here",
  "metric_direction": "higher"
}
\`\`\`

Fields:
- tag: lowercase alphanumeric + hyphens, descriptive (e.g. "docboost-prompt-rewrite", "search-engine-tuning")
- agent_type: one of "claude-code", "codex", "aider", "gemini-cli"
- strategy: the research strategy — be detailed and specific about what to optimize and how
- metric_name: any snake_case name (e.g. "f1_pct", "mrr_at_5", "bleu_score", "ndcg_at_10"). Pick the metric that best measures success for the task.
- metric_direction: "higher" or "lower" — which direction is better for this metric

Always explain WHY you chose the metric and direction before the config block.`;


function formatSessions(sessions: Session[]): string {
  if (sessions.length === 0) return "No active sessions.";
  return sessions
    .map((s) => {
      const duration = s.started_at
        ? `${Math.round((Date.now() - s.started_at) / 60000)}m`
        : "not started";
      return `- ${s.tag} [${s.status}] agent=${s.agent_type} metric=${s.metric_name} best=${s.best_val_bpb ?? "none"} experiments=${s.experiment_count} duration=${duration}`;
    })
    .join("\n");
}

function isBetter(a: number, b: number, direction: string): boolean {
  return direction === "higher" ? a > b : a < b;
}

function analyzeTrend(
  experiments: Experiment[],
  metricName: string,
  metricDirection: string
): string {
  if (experiments.length === 0) return "No experiments to analyze.";

  const total = experiments.length;
  const kept = experiments.filter((e) => e.committed === 1);
  const discarded = experiments.filter((e) => e.committed === 0);
  const successRate = total > 0 ? ((kept.length / total) * 100).toFixed(1) : "0";

  // Best metric tracking
  const bestExp = experiments.reduce((best, e) =>
    isBetter(e.val_bpb, best.val_bpb, metricDirection) ? e : best
  );

  // First experiment value
  const firstVal = experiments[0].val_bpb;

  // Improvement milestones — track when best metric improved
  let runningBest = experiments[0].val_bpb;
  const milestones: Array<{ run: number; val: number; summary: string | null }> = [
    { run: experiments[0].run_number, val: firstVal, summary: experiments[0].change_summary },
  ];
  for (const e of experiments.slice(1)) {
    if (isBetter(e.val_bpb, runningBest, metricDirection)) {
      runningBest = e.val_bpb;
      milestones.push({ run: e.run_number, val: e.val_bpb, summary: e.change_summary });
    }
  }

  // How long since last improvement
  const lastMilestone = milestones[milestones.length - 1];
  const experimentsSinceImprovement = total - lastMilestone.run;

  // Recent window analysis (last 20 experiments)
  const recentWindow = 20;
  const recent = experiments.slice(-recentWindow);
  const recentKept = recent.filter((e) => e.committed === 1);
  const recentSuccessRate = ((recentKept.length / recent.length) * 100).toFixed(1);

  // Recent improvement (best in last 20 vs best before that)
  const olderExperiments = experiments.slice(0, -recentWindow);
  let recentImprovement = "N/A";
  if (olderExperiments.length > 0) {
    const olderBest = olderExperiments.reduce((best, e) =>
      isBetter(e.val_bpb, best.val_bpb, metricDirection) ? e : best
    );
    const recentBest = recent.reduce((best, e) =>
      isBetter(e.val_bpb, best.val_bpb, metricDirection) ? e : best
    );
    const delta = recentBest.val_bpb - olderBest.val_bpb;
    recentImprovement = `${delta > 0 ? "+" : ""}${delta.toFixed(4)}`;
  }

  // Sliding window analysis: compare improvement across different windows
  const windows = [10, 25, 50].filter((w) => w < total);
  const windowAnalysis = windows.map((w) => {
    const windowExps = experiments.slice(-w);
    const windowKept = windowExps.filter((e) => e.committed === 1);
    const windowBest = windowExps.reduce((best, e) =>
      isBetter(e.val_bpb, best.val_bpb, metricDirection) ? e : best
    );
    const windowWorst = windowExps.reduce((worst, e) =>
      isBetter(worst.val_bpb, e.val_bpb, metricDirection) ? e : worst
    );
    return `  Last ${w}: ${windowKept.length}/${w} kept (${((windowKept.length / w) * 100).toFixed(0)}%), best=${windowBest.val_bpb.toFixed(4)}, worst=${windowWorst.val_bpb.toFixed(4)}`;
  });

  // Plateau detection — consecutive experiments without improvement
  let plateauLength = 0;
  let currentBest = bestExp.val_bpb;
  for (let i = experiments.length - 1; i >= 0; i--) {
    if (experiments[i].val_bpb === currentBest) {
      // This is the best itself, count from here
      plateauLength = experiments.length - 1 - i;
      break;
    }
  }

  // Average experiment duration
  const withDuration = experiments.filter((e) => e.duration_s !== null);
  const avgDuration = withDuration.length > 0
    ? (withDuration.reduce((s, e) => s + (e.duration_s ?? 0), 0) / withDuration.length)
    : null;

  // Total runtime
  const totalDuration = experiments.length > 0
    ? ((experiments[experiments.length - 1].created_at - experiments[0].created_at) / 60000).toFixed(0)
    : "0";

  const lines = [
    `Total experiments: ${total} (${kept.length} kept, ${discarded.length} discarded, ${successRate}% success rate)`,
    `Starting ${metricName}: ${firstVal.toFixed(4)}`,
    `Current best ${metricName}: ${bestExp.val_bpb.toFixed(4)} (run #${bestExp.run_number})`,
    `Total improvement: ${(bestExp.val_bpb - firstVal) > 0 ? "+" : ""}${(bestExp.val_bpb - firstVal).toFixed(4)}`,
    `Experiments since last improvement: ${experimentsSinceImprovement}`,
    `Plateau length: ${plateauLength} experiments without new best`,
    ``,
    `Recent ${recentWindow} experiments: ${recentKept.length}/${recent.length} kept (${recentSuccessRate}% success rate)`,
    `Recent improvement vs prior best: ${recentImprovement}`,
    ``,
    `Sliding window breakdown:`,
    ...windowAnalysis,
    ``,
    `Total runtime: ${totalDuration} minutes`,
  ];

  if (avgDuration !== null) {
    lines.push(`Average experiment duration: ${(avgDuration / 60).toFixed(1)} minutes`);
  }

  // Key milestones (show up to 10 improvement points)
  const shownMilestones = milestones.length > 10
    ? [...milestones.slice(0, 3), ...milestones.slice(-7)]
    : milestones;
  lines.push(
    ``,
    `Improvement milestones (${milestones.length} total improvements):`,
    ...shownMilestones.map((m) =>
      `  Run #${m.run}: ${metricName}=${m.val.toFixed(4)}${m.summary ? ` — ${m.summary}` : ""}`
    )
  );
  if (milestones.length > 10) {
    lines.splice(
      lines.length - 7,
      0,
      `  ... (${milestones.length - 10} milestones omitted) ...`
    );
  }

  return lines.join("\n");
}

function formatRecentExperiments(
  experiments: Experiment[],
  count: number
): string {
  if (experiments.length === 0) return "No experiments yet.";
  const recent = experiments.slice(-count);
  const skipped = experiments.length - recent.length;
  const lines: string[] = [];
  if (skipped > 0) {
    lines.push(`(${skipped} earlier experiments omitted — see trend analysis above)`);
  }
  for (const e of recent) {
    const tag = e.committed ? "KEPT" : "DISCARDED";
    const delta = e.delta !== null ? ` (delta: ${e.delta > 0 ? "+" : ""}${e.delta.toFixed(4)})` : "";
    lines.push(`- Run #${e.run_number}: ${e.val_bpb.toFixed(4)}${delta} [${tag}] — ${e.change_summary ?? "no description"}`);
  }
  return lines.join("\n");
}

interface ContextOptions {
  message: string;
  conversationId: string;
  sessionId?: string;
}

export async function assembleContext(
  options: ContextOptions
): Promise<{ systemPrompt: string; conversationHistory: Array<{ role: "user" | "assistant"; content: string }> }> {
  const { message, conversationId, sessionId } = options;
  const msgLower = message.toLowerCase();

  // Always-included: all sessions overview
  const sessions = db.listSessions();
  const contextParts: string[] = [
    "## Current Sessions",
    formatSessions(sessions),
  ];

  // Session-focused: if a session is selected or mentioned by name
  let focusedSession: Session | undefined;
  if (sessionId) {
    focusedSession = db.getSession(sessionId);
  } else {
    // Try exact tag match first, then partial match (e.g. "docboost" matches "docboost-f1")
    focusedSession = sessions.find((s) =>
      msgLower.includes(s.tag.toLowerCase())
    );
    if (!focusedSession) {
      // Try matching tag prefixes by progressively dropping trailing segments
      // e.g. "docboost-f1" → try "docboost" (4+ chars required)
      focusedSession = sessions.find((s) => {
        const segments = s.tag.toLowerCase().split("-");
        for (let len = segments.length - 1; len >= 1; len--) {
          const prefix = segments.slice(0, len).join("-");
          if (prefix.length >= 4 && msgLower.includes(prefix)) return true;
        }
        return false;
      });
    }
    // If only one session exists and user refers to "it"/"session"/"the session", focus it
    if (!focusedSession && sessions.length === 1) {
      if (/\b(it|session|the session|this|stop|progress|improve|trend|plateau)\b/i.test(message)) {
        focusedSession = sessions[0];
      }
    }
  }

  if (focusedSession) {
    const experiments = db.getExperiments(focusedSession.id);
    const events = db.listSessionEvents({ session_id: focusedSession.id, limit: 25 });

    const metricName = focusedSession.metric_name;
    const metricDirection = focusedSession.metric_direction;

    contextParts.push(
      `\n## Focused Session: ${focusedSession.tag}`,
      `Status: ${focusedSession.status}`,
      `Agent: ${focusedSession.agent_type}`,
      `Strategy: ${focusedSession.strategy}`,
      `Metric: ${metricName} (${metricDirection} is better)`,
      `Best: ${focusedSession.best_val_bpb ?? "none"}`,
      `Restarts: ${focusedSession.restart_count}`,
    );

    // Include last known output for dead sessions (failed/killed/paused with no tmux)
    if (focusedSession.last_output_snapshot) {
      const isDead = focusedSession.status === "failed" ||
        focusedSession.status === "killed" ||
        focusedSession.status === "completed";
      if (isDead || experiments.length === 0) {
        contextParts.push(
          `\n### Last Terminal Output (captured before session died)`,
          "```",
          focusedSession.last_output_snapshot,
          "```"
        );
      }
    }
    if (focusedSession.last_summary) {
      contextParts.push(`Last Summary: ${focusedSession.last_summary}`);
    }

    // Always include trend analysis for focused sessions with experiments
    if (experiments.length > 0) {
      contextParts.push(
        `\n### Trend Analysis`,
        analyzeTrend(experiments, metricName, metricDirection),
      );
    }

    // Show last 15 experiments in detail
    contextParts.push(
      `\n### Recent Experiments (last 15)`,
      formatRecentExperiments(experiments, 15),
    );

    if (events.length > 0) {
      contextParts.push(
        `\n### Recent Events (last 25)`,
        events
          .slice(0, 25)
          .map((e) => {
            const detail = e.details ? ` | ${e.details}` : "";
            return `- [${e.type}] ${e.message}${detail}`;
          })
          .join("\n")
      );
    }

    // On-demand: live tmux output
    const wantsLive =
      /what.*(happen|doing|running|now|current|status|live|active)/i.test(message);
    if (wantsLive && focusedSession.tmux_session) {
      try {
        const activity = await captureActivity(
          focusedSession.tmux_session,
          focusedSession.worktree_path
        );
        contextParts.push(
          `\n### Live Activity`,
          `Status: ${activity.status}`,
          `Summary: ${activity.summary}`,
          `Modified files: ${activity.modifiedFiles.join(", ") || "none"}`,
          `\nRaw terminal output (last 50 lines):`,
          "```",
          activity.rawOutput,
          "```"
        );
      } catch {
        contextParts.push(
          `\n### Live Activity`,
          "Could not capture tmux output."
        );
      }
    }

    // On-demand: git diffs
    const wantsDiff =
      /what.*(chang|diff|modif)|show.*(code|change|diff)|explain.*(change|experiment)/i.test(message);
    if (wantsDiff && focusedSession.worktree_path) {
      try {
        const log = await getBranchLog(focusedSession.worktree_path, 5);
        contextParts.push(
          `\n### Recent Git Commits`,
          log
            .map((c) => `- ${c.hash.slice(0, 7)} ${c.message}`)
            .join("\n")
        );

        // Get diff stats for the most recent commit
        if (log.length > 0) {
          const stats = await getCommitDiffStats(
            focusedSession.worktree_path,
            log[0].hash
          );
          if (stats.files.length > 0) {
            contextParts.push(
              `\nLatest commit diff stats:`,
              stats.files
                .map(
                  (s) =>
                    `  ${s.file}: +${s.insertions} -${s.deletions}`
                )
                .join("\n")
            );
          }
        }
      } catch {
        contextParts.push(`\n### Git History`, "Could not read git log.");
      }
    }
  }

  // Conversation history
  const history = chatDb
    .getMessages(conversationId, 20)
    .map((m) => ({ role: m.role, content: m.content }));

  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${contextParts.join("\n")}`;

  return { systemPrompt: fullSystemPrompt, conversationHistory: history };
}
