import type { Session, ParsedExperiment, AlertType } from "./types";
import * as db from "./db";
import { broker } from "./sse-broker";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

function isConfigured(): boolean {
  return BOT_TOKEN.length > 0 && CHAT_ID.length > 0;
}

export async function sendTelegramAlert(message: string): Promise<void> {
  if (!isConfigured()) return;

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* best effort — do not crash session lifecycle for alert failure */
  }
}

function recordAlert(
  sessionId: string,
  alertType: AlertType,
  message: string
): void {
  try {
    db.insertAlert({
      session_id: sessionId,
      type: alertType,
      message,
      sent: isConfigured() ? 1 : 0,
    });

    broker.broadcast({
      type: "alert",
      alert: {
        id: 0,
        session_id: sessionId,
        type: alertType,
        message,
        sent: isConfigured() ? 1 : 0,
        created_at: Date.now(),
      },
    });
  } catch {
    /* best effort */
  }
}

export function evaluateExperimentAlerts(
  session: Session,
  experiments: ParsedExperiment[]
): void {
  for (const exp of experiments) {
    if (
      session.best_val_bpb !== null &&
      exp.val_bpb < session.best_val_bpb
    ) {
      const delta = exp.val_bpb - session.best_val_bpb;
      const msg =
        `<b>New Best BPB</b>\n` +
        `Session: <code>${session.tag}</code>\n` +
        `BPB: <code>${exp.val_bpb.toFixed(4)}</code> (${delta.toFixed(4)})\n` +
        `Run #${exp.run_number}`;

      recordAlert(session.id, "breakthrough", msg);
      void sendTelegramAlert(msg);
    }
  }
}

export function alertSessionCompleted(session: Session): void {
  const msg =
    `<b>Session Completed</b>\n` +
    `Session: <code>${session.tag}</code>\n` +
    `Best BPB: <code>${session.best_val_bpb?.toFixed(4) ?? "--"}</code>\n` +
    `Experiments: ${session.experiment_count} | Commits: ${session.commit_count}`;

  recordAlert(session.id, "completed", msg);
  void sendTelegramAlert(msg);
}

export function alertSessionFailed(session: Session, reason: string): void {
  const msg =
    `<b>Session Failed</b>\n` +
    `Session: <code>${session.tag}</code>\n` +
    `Reason: ${reason}`;

  recordAlert(session.id, "failure", msg);
  void sendTelegramAlert(msg);
}

export function alertSessionStall(
  session: Session,
  stallMinutes: number
): void {
  const msg =
    `<b>Session Stall Detected</b>\n` +
    `Session: <code>${session.tag}</code>\n` +
    `No new experiments for ${stallMinutes} minutes`;

  recordAlert(session.id, "stall", msg);
  void sendTelegramAlert(msg);
}
