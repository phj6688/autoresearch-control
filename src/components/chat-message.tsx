"use client";

import type { DisplayMessage } from "@/hooks/use-chat";

interface ChatMessageProps {
  message: DisplayMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed"
        style={{
          backgroundColor: isUser
            ? "var(--color-accent)"
            : "var(--color-surface)",
          color: isUser ? "var(--color-bg)" : "var(--color-text-primary)",
          borderColor: isUser ? "transparent" : "var(--color-border)",
          borderWidth: isUser ? 0 : 1,
        }}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {isStreaming && message.role === "assistant" && (
          <span
            className="ml-0.5 inline-block h-3 w-1 animate-pulse"
            style={{ backgroundColor: "var(--color-accent)" }}
          />
        )}
      </div>
    </div>
  );
}
