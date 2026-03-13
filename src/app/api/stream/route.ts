import { broker } from "@/lib/sse-broker";

export const dynamic = "force-dynamic";

export function GET(): Response {
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
