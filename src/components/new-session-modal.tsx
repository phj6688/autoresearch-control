"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSessionStore } from "@/stores/session-store";
import type { AgentType, Session } from "@/lib/types";

const AGENT_OPTIONS: Array<{ value: AgentType; label: string }> = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "aider", label: "Aider" },
  { value: "gemini-cli", label: "Gemini CLI" },
];

const TAG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  seedFrom?: Session | null;
}

interface FormState {
  tag: string;
  agent_type: AgentType;
  strategy: string;
  gpu: string;
}

export function NewSessionModal({
  open,
  onClose,
  seedFrom,
}: NewSessionModalProps) {
  const setSessions = useSessionStore((s) => s.setSessions);
  const selectSession = useSessionStore((s) => s.selectSession);
  const setView = useSessionStore((s) => s.setView);

  const [form, setForm] = useState<FormState>({
    tag: "",
    agent_type: "claude-code",
    strategy: "",
    gpu: "auto",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const tagRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setErrors({});
      setServerError(null);
      setSubmitting(false);

      if (seedFrom) {
        setForm({
          tag: "",
          agent_type: seedFrom.agent_type,
          strategy: seedFrom.strategy,
          gpu: "auto",
        });
      } else {
        setForm({
          tag: "",
          agent_type: "claude-code",
          strategy: "",
          gpu: "auto",
        });
      }

      setTimeout(() => tagRef.current?.focus(), 50);
    }
  }, [open, seedFrom]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const validate = useCallback((): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!form.tag || form.tag.length < 2) {
      next.tag = "Tag must be at least 2 characters";
    } else if (!TAG_REGEX.test(form.tag)) {
      next.tag =
        "Lowercase alphanumeric and hyphens only, no leading/trailing hyphens";
    }

    if (!form.strategy.trim()) {
      next.strategy = "Strategy is required";
    }

    if (form.gpu !== "auto") {
      const n = Number(form.gpu);
      if (!Number.isInteger(n) || n < 0) {
        next.gpu = "Must be a valid GPU index or 'auto'";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setSubmitting(true);
      setServerError(null);

      try {
        const body: Record<string, unknown> = {
          tag: form.tag,
          agent_type: form.agent_type,
          strategy: form.strategy,
        };

        if (form.gpu !== "auto") {
          body.gpu_index = Number(form.gpu);
        }

        if (seedFrom) {
          body.seed_from = seedFrom.id;
        }

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setServerError(data.error ?? `Request failed (${res.status})`);
          return;
        }

        const listRes = await fetch("/api/sessions");
        if (listRes.ok) {
          const sessions = (await listRes.json()) as Session[];
          setSessions(sessions);
        }

        const created = (await res.json()) as Session;
        selectSession(created.id);
        setView("dashboard");
        onClose();
      } catch (err) {
        setServerError(
          err instanceof Error ? err.message : "Network error"
        );
      } finally {
        setSubmitting(false);
      }
    },
    [form, seedFrom, validate, onClose, setSessions, selectSession, setView]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-lg rounded-lg border p-6"
        style={{
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2
            className="text-sm font-bold uppercase tracking-wider"
            style={{ color: "var(--color-accent)" }}
          >
            {seedFrom ? "Fork Session" : "New Session"}
          </h2>
          <button
            onClick={onClose}
            className="text-xs transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            ESC
          </button>
        </div>

        {seedFrom && (
          <div
            className="mb-4 rounded border border-dashed px-3 py-2 text-xs"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            Forking from{" "}
            <span
              className="font-bold"
              style={{ color: "var(--color-accent)" }}
            >
              {seedFrom.tag}
            </span>
            {" "}— best train.py will be seeded into the new worktree.
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {/* Tag */}
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Tag
            </label>
            <input
              ref={tagRef}
              type="text"
              value={form.tag}
              onChange={(e) => setField("tag", e.target.value)}
              placeholder="e.g. muon-lr-sweep"
              className="w-full rounded border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: "var(--color-bg)",
                borderColor: errors.tag
                  ? "var(--color-error)"
                  : "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
            {errors.tag && (
              <div
                className="mt-1 text-xs"
                style={{ color: "var(--color-error)" }}
              >
                {errors.tag}
              </div>
            )}
          </div>

          {/* Agent Type */}
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Agent
            </label>
            <div
              className="flex rounded border"
              style={{ borderColor: "var(--color-border)" }}
            >
              {AGENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="flex-1 px-2 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor:
                      form.agent_type === opt.value
                        ? "var(--color-accent)"
                        : "transparent",
                    color:
                      form.agent_type === opt.value
                        ? "var(--color-bg)"
                        : "var(--color-text-secondary)",
                  }}
                  onClick={() => setField("agent_type", opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Strategy */}
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Strategy
            </label>
            <textarea
              value={form.strategy}
              onChange={(e) => setField("strategy", e.target.value)}
              placeholder="Describe the research strategy for this session..."
              rows={4}
              className="w-full resize-none rounded border px-3 py-2 text-xs leading-relaxed outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: "var(--color-bg)",
                borderColor: errors.strategy
                  ? "var(--color-error)"
                  : "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
            {errors.strategy && (
              <div
                className="mt-1 text-xs"
                style={{ color: "var(--color-error)" }}
              >
                {errors.strategy}
              </div>
            )}
          </div>

          {/* GPU */}
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              GPU
            </label>
            <select
              value={form.gpu}
              onChange={(e) => setField("gpu", e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: "var(--color-bg)",
                borderColor: errors.gpu
                  ? "var(--color-error)"
                  : "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              <option value="auto">Auto (first available)</option>
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={String(i)}>
                  GPU {i}
                </option>
              ))}
            </select>
            {errors.gpu && (
              <div
                className="mt-1 text-xs"
                style={{ color: "var(--color-error)" }}
              >
                {errors.gpu}
              </div>
            )}
          </div>

          {/* Server error */}
          {serverError && (
            <div
              className="rounded border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--color-error)",
                backgroundColor: "var(--color-status-failed-bg)",
                color: "var(--color-error)",
              }}
            >
              {serverError}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg)",
              }}
            >
              {submitting
                ? "Creating..."
                : seedFrom
                  ? "Fork Session"
                  : "Create Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
