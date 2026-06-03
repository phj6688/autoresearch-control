/**
 * Best-effort alerts to openclaw (Squad Monitor) for critical session events.
 * All errors are swallowed — alerting must never crash the main flow.
 */

const OPENCLAW_URL = process.env.OPENCLAW_ALERT_URL;

async function sendAlert(text: string): Promise<void> {
  if (!OPENCLAW_URL) return;
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
