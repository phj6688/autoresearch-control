import { broker } from "@/lib/sse-broker";
import { startDocboostWatcher } from "@/lib/docboost-watcher";

export const dynamic = "force-dynamic";

let docboostWatcherStarted = false;

export function GET(): Response {
  if (!docboostWatcherStarted) {
    docboostWatcherStarted = true;
    startDocboostWatcher();
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
