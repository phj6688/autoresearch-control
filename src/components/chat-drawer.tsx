"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useChat } from "@/hooks/use-chat";
import { useSessionStore } from "@/stores/session-store";
import { ChatMessage } from "./chat-message";
import { ErrorBoundary } from "./error-boundary";

function ChatDrawerInner() {
  const drawerOpen = useChatStore((s) => s.drawerOpen);
  const closeDrawer = useChatStore((s) => s.closeDrawer);
  const selectedId = useSessionStore((s) => s.selectedId);
  const sessions = useSessionStore((s) => s.sessions);

  const selectedSession = sessions.find((s) => s.id === selectedId);

  const { messages, streaming, error, sendMessage, newConversation } =
    useChat(selectedId ?? undefined);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when drawer opens
  useEffect(() => {
    if (drawerOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [drawerOpen]);

  const handleSend = useCallback(() => {
    if (input.trim() && !streaming) {
      sendMessage(input);
      setInput("");
    }
  }, [input, streaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (!drawerOpen) return null;

  return (
    <div
      className="flex h-full w-[420px] shrink-0 flex-col border-l"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-accent)" }}
          >
            Assistant
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => newConversation()}
            className="rounded px-2 py-1 text-[10px] font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--color-text-secondary)" }}
            title="New conversation"
          >
            New
          </button>
          <button
            type="button"
            onClick={closeDrawer}
            className="rounded px-2 py-1 text-[10px] font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div
            className="mt-8 text-center text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>Ask anything</div>
            <div>Sessions, experiments, strategies, or what your agents are doing right now.</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isStreaming={streaming && i === messages.length - 1}
          />
        ))}
        {error && (
          <div
            className="mt-2 rounded px-3 py-2 text-xs"
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.1)",
              color: "var(--color-error)",
            }}
          >
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Context indicator + Input */}
      <div
        className="border-t px-3 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        {selectedSession && (
          <div
            className="mb-1 text-[10px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Viewing: {selectedSession.tag}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 resize-none rounded border bg-transparent px-2 py-1.5 text-xs outline-none"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            placeholder="Ask anything..."
            aria-label="Message to assistant"
            disabled={streaming}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            aria-label={streaming ? "Sending message" : "Send message"}
            className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            {streaming ? (
              <svg
                width={14}
                height={14}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="animate-spin"
              >
                <circle cx="8" cy="8" r="6" opacity="0.25" />
                <path d="M14 8a6 6 0 0 0-6-6" />
              </svg>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatDrawer() {
  return (
    <ErrorBoundary fallbackLabel="Chat">
      <ChatDrawerInner />
    </ErrorBoundary>
  );
}
