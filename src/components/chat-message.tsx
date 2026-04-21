"use client";

import { useCallback } from "react";
import type { DisplayMessage } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chat-store";
import type { SuggestedSessionConfig } from "@/stores/chat-store";
import { Markdown } from "./markdown";

const SESSION_CONFIG_RE = /```session-config\n([\s\S]*?)```/g;

function parseSessionConfig(json: string): SuggestedSessionConfig | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const config: SuggestedSessionConfig = {};
    if (typeof parsed.tag === "string") config.tag = parsed.tag;
    if (typeof parsed.agent_type === "string") config.agent_type = parsed.agent_type;
    if (typeof parsed.strategy === "string") config.strategy = parsed.strategy;
    if (typeof parsed.metric_name === "string") config.metric_name = parsed.metric_name;
    if (parsed.metric_direction === "higher" || parsed.metric_direction === "lower") {
      config.metric_direction = parsed.metric_direction;
    }
    if (typeof parsed.gpu === "string") config.gpu = parsed.gpu;
    return config;
  } catch {
    return null;
  }
}

interface ConfigCardProps {
  config: SuggestedSessionConfig;
}

function ConfigCard({ config }: ConfigCardProps) {
  const applySuggestion = useChatStore((s) => s.applySuggestion);

  const handleApply = useCallback(() => {
    applySuggestion(config);
  }, [config, applySuggestion]);

  return (
    <div
      className="my-2 rounded border p-3"
      style={{
        borderColor: "var(--color-accent)",
        backgroundColor: "rgba(96, 165, 250, 0.05)",
      }}
    >
      <div
        className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-accent)" }}
      >
        Suggested Session Config
      </div>
      <div className="space-y-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
        {config.tag && (
          <div><span style={{ color: "var(--color-text-muted)" }}>Tag:</span> {config.tag}</div>
        )}
        {config.metric_name && (
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Metric:</span> {config.metric_name}
            {config.metric_direction && ` (${config.metric_direction} is better)`}
          </div>
        )}
        {config.agent_type && (
          <div><span style={{ color: "var(--color-text-muted)" }}>Agent:</span> {config.agent_type}</div>
        )}
        {config.strategy && (
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Strategy:</span>{" "}
            {config.strategy.length > 120 ? config.strategy.slice(0, 120) + "..." : config.strategy}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleApply}
        className="mt-2 rounded px-3 py-1 text-xs font-semibold transition-colors"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg)",
        }}
      >
        Apply to New Session
      </button>
    </div>
  );
}

interface ChatMessageProps {
  message: DisplayMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Parse session-config blocks from assistant messages
  const parts: Array<{ type: "text"; content: string } | { type: "config"; config: SuggestedSessionConfig }> = [];

  if (!isUser) {
    let lastIndex = 0;
    const regex = new RegExp(SESSION_CONFIG_RE.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(message.content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: message.content.slice(lastIndex, match.index) });
      }
      const config = parseSessionConfig(match[1]);
      if (config) {
        parts.push({ type: "config", config });
      } else {
        parts.push({ type: "text", content: match[0] });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < message.content.length) {
      parts.push({ type: "text", content: message.content.slice(lastIndex) });
    }
  }

  if (isUser || parts.length === 0) {
    parts.length = 0;
    parts.push({ type: "text", content: message.content });
  }

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
        {parts.map((part, i) =>
          part.type === "text" ? (
            isUser ? (
              <div key={i} className="whitespace-pre-wrap break-words">{part.content}</div>
            ) : (
              <Markdown key={i} content={part.content} />
            )
          ) : (
            <ConfigCard key={i} config={part.config} />
          )
        )}
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
