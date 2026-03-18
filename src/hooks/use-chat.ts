import { useState, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/base-path";
import { useChatStore } from "@/stores/chat-store";

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export function useChat(sessionId?: string) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(
    useChatStore.getState().activeConversationId
  );

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(
        apiUrl(`/api/chat/conversations/${convId}`)
      );
      if (!res.ok) return;
      const data = await res.json();
      conversationIdRef.current = convId;
      useChatStore.getState().setActiveConversation(convId);
      setMessages(
        data.messages.map(
          (m: { id: number; role: string; content: string; created_at: number }) => ({
            id: String(m.id),
            role: m.role as "user" | "assistant",
            content: m.content,
            createdAt: m.created_at,
          })
        )
      );
    } catch {
      setError("Failed to load conversation");
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;

      setError(null);
      const userMsg: DisplayMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: content.trim(),
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);

      const assistantMsg: DisplayMessage = {
        id: `local-${Date.now()}-assistant`,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(apiUrl("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationIdRef.current,
            message: content.trim(),
            sessionId,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ") && eventType) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === "token") {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content + data.text,
                      };
                    }
                    return updated;
                  });
                } else if (eventType === "done" && data.conversationId) {
                  conversationIdRef.current = data.conversationId;
                  useChatStore
                    .getState()
                    .setActiveConversation(data.conversationId);
                } else if (eventType === "error") {
                  setError(data.message);
                }
              } catch {
                // Skip malformed JSON
              }
              eventType = "";
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "Connection failed");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, sessionId]
  );

  const newConversation = useCallback(() => {
    conversationIdRef.current = null;
    useChatStore.getState().setActiveConversation(null);
    setMessages([]);
    setError(null);
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    streaming,
    error,
    sendMessage,
    loadConversation,
    newConversation,
    cancelStream,
  };
}
