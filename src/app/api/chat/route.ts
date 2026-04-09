import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { assembleContext } from "@/lib/chat-context";
import * as chatDb from "@/lib/chat-db";

export const dynamic = "force-dynamic";

const clientState = { client: null as Anthropic | null };

function getClient(): Anthropic {
  if (!clientState.client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }
    clientState.client = new Anthropic({ apiKey });
  }
  return clientState.client;
}

function invalidateClient(): void {
  clientState.client = null;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { conversationId?: string; message?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  const { message, sessionId } = body;
  let { conversationId } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
    });
  }

  // Create or validate conversation
  if (!conversationId) {
    const conv = chatDb.createConversation();
    conversationId = conv.id;
  } else {
    const existing = chatDb.getConversation(conversationId);
    if (!existing) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404 }
      );
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Immediate status event to keep proxy alive
      sendEvent("status", {
        status: "assembling_context",
        conversationId,
      });

      // Heartbeat during context assembly (proxy survival)
      const heartbeatInterval = setInterval(() => {
        sendEvent("heartbeat", {});
      }, 5000);

      try {
        const client = getClient();
        const model =
          process.env.ASSISTANT_MODEL || "claude-haiku-4-5-20251001";

        // Assemble context BEFORE storing user message to avoid duplication
        const { systemPrompt, conversationHistory } = await assembleContext({
          message: message.trim(),
          conversationId,
          sessionId,
        });

        clearInterval(heartbeatInterval);

        // Store user message AFTER context assembly
        chatDb.insertMessage(conversationId, "user", message.trim(), sessionId);

        // Build messages from history + new user message, ensuring no consecutive same-role messages
        const rawMessages = [
          ...conversationHistory.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user" as const, content: message.trim() },
        ];

        // Merge consecutive same-role messages (can happen if a previous API call failed
        // and no assistant response was stored)
        const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
        for (const msg of rawMessages) {
          if (messages.length > 0 && messages[messages.length - 1].role === msg.role) {
            messages[messages.length - 1].content += "\n\n" + msg.content;
          } else {
            messages.push({ ...msg });
          }
        }

        sendEvent("status", { status: "streaming" });

        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages,
          stream: true,
        });

        let fullResponse = "";

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullResponse += event.delta.text;
            sendEvent("token", { text: event.delta.text });
          }
        }

        // Store assistant response
        chatDb.insertMessage(
          conversationId,
          "assistant",
          fullResponse,
          sessionId
        );

        sendEvent("done", { conversationId });
      } catch (err: unknown) {
        clearInterval(heartbeatInterval);
        const error = err as { status?: number; message?: string };
        if (error.status === 429 || error.status === 529) {
          sendEvent("error", {
            message: "Service temporarily unavailable, try again in a moment",
          });
        } else if (error.status === 401) {
          invalidateClient();
          sendEvent("error", { message: "API key invalid or expired — retrying on next request" });
        } else {
          sendEvent("error", {
            message: error.message || "An unexpected error occurred",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
