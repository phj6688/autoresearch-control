import { broker } from "@/lib/sse-broker";
import { startHealthAgent } from "@/lib/health-agent";

export const dynamic = "force-dynamic";

let healthAgentStarted = false;

export function GET(): Response {
  if (!healthAgentStarted) {
    healthAgentStarted = true;
    startHealthAgent();
  }

  const { stream } = broker.subscribe();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
