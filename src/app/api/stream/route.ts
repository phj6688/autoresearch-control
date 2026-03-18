import { broker } from "@/lib/sse-broker";
import { startDocboostWatcher } from "@/lib/docboost-watcher";
import { startHealthAgent } from "@/lib/health-agent";

export const dynamic = "force-dynamic";

let docboostWatcherStarted = false;
let healthAgentStarted = false;

export function GET(): Response {
  if (!docboostWatcherStarted) {
    docboostWatcherStarted = true;
    startDocboostWatcher();
  }
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
