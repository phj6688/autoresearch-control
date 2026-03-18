/**
 * Best-effort alerts to openclaw (Squad Monitor) for critical session events.
 * All errors are swallowed — alerting must never crash the main flow.
 */

const OPENCLAW_URL = "http://localhost:7777/api/messages";

async function sendAlert(text: string): Promise<void> {
  try {
    await fetch(OPENCLAW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* best effort — never throw */
  }
}

export async function alertCriticalFailure(
  sessionTag: string,
  reason: string
): Promise<void> {
  await sendAlert(
    `[autoresearch] CRITICAL: Session "${sessionTag}" failed unrecoverably — ${reason}`
  );
}

export async function alertEscalationResult(
  sessionTag: string,
  result: string
): Promise<void> {
  await sendAlert(
    `[autoresearch] Escalation for "${sessionTag}": ${result}`
  );
}
