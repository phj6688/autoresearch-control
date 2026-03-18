import * as db from "./db";
import * as chatDb from "./chat-db";
import { captureActivity } from "./activity-parser";
import { getBranchLog, getCommitDiffStats } from "./git";
import type { Session } from "./types";

const SYSTEM_PROMPT = `You are the Autoresearch Mission Control assistant. You help the user understand and manage their autonomous research sessions.

Behavior:
- Be concise and direct — no filler, no "Great question!"
- Explain technical concepts in plain language that a non-engineer can understand
- When describing experiments: explain what was changed, why it was tried, whether it worked, and what it means for next steps
- Use project metric names naturally ("F1 improved from 65.9% to 68.4%" not "val_bpb increased")
- When helping create sessions: ask about the goal, suggest a strategy, recommend agent/GPU/metric settings
- When asked about live state: describe what the agent is doing based on tmux output

Boundaries:
- You have read-only access — you cannot execute commands or modify sessions
- If asked to take action, tell the user which buttons to press in the UI
- Say "I don't have enough context to answer that" rather than guessing`;

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

function formatExperiments(
  experiments: Array<{
    run_number: number;
    val_bpb: number;
    change_summary: string | null;
    delta: number | null;
    committed: number;
  }>
): string {
  if (experiments.length === 0) return "No experiments yet.";
  return experiments
    .map((e) => {
      const tag = e.committed ? "KEPT" : "DISCARDED";
      const delta = e.delta !== null ? ` (delta: ${e.delta > 0 ? "+" : ""}${e.delta.toFixed(2)})` : "";
      return `- Run #${e.run_number}: ${e.val_bpb.toFixed(2)}${delta} [${tag}] — ${e.change_summary ?? "no description"}`;
    })
    .join("\n");
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
    focusedSession = sessions.find((s) =>
      msgLower.includes(s.tag.toLowerCase())
    );
  }

  if (focusedSession) {
    const experiments = db.getExperiments(focusedSession.id);
    const events = db.listSessionEvents({ session_id: focusedSession.id });

    contextParts.push(
      `\n## Focused Session: ${focusedSession.tag}`,
      `Status: ${focusedSession.status}`,
      `Agent: ${focusedSession.agent_type}`,
      `Strategy: ${focusedSession.strategy}`,
      `Metric: ${focusedSession.metric_name} (${focusedSession.metric_direction} is better)`,
      `Best: ${focusedSession.best_val_bpb ?? "none"}`,
      `Restarts: ${focusedSession.restart_count}`,
      `\n### Experiments`,
      formatExperiments(experiments),
    );

    if (events.length > 0) {
      contextParts.push(
        `\n### Recent Events`,
        events
          .slice(0, 10)
          .map((e) => `- [${e.type}] ${e.message}`)
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
