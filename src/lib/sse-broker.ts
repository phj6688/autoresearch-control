import { nanoid } from "nanoid";
import type { SSEEvent } from "./types";

interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
}

const encoder = new TextEncoder();

class SSEBroker {
  private clients = new Map<string, SSEClient>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeat();
  }

  subscribe(): { stream: ReadableStream<Uint8Array>; id: string } {
    const id = nanoid(8);
    let clientRef: SSEClient | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        clientRef = { id, controller };
        this.clients.set(id, clientRef);
      },
      cancel: () => {
        this.clients.delete(id);
      },
    });

    return { stream, id };
  }

  unsubscribe(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      try {
        client.controller.close();
      } catch {
        /* already closed */
      }
      this.clients.delete(id);
    }
  }

  broadcast(event: SSEEvent): void {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const encoded = encoder.encode(data);

    for (const [id, client] of this.clients) {
      try {
        client.controller.enqueue(encoded);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({ type: "heartbeat" });
    }, 15000);
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

const globalBroker = globalThis as unknown as { _sseBroker?: SSEBroker };

export const broker: SSEBroker =
  globalBroker._sseBroker ?? (globalBroker._sseBroker = new SSEBroker());
