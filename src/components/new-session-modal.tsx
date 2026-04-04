"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSessionStore } from "@/stores/session-store";
import { apiUrl } from "@/lib/base-path";
import type { AgentType, MetricDirection, Session } from "@/lib/types";
import type { SuggestedSessionConfig } from "@/stores/chat-store";

interface GpuInfo {
  index: number;
  name: string;
  memory_total_mb: number;
  memory_used_mb: number;
  utilization_pct: number;
  temperature_c: number;
  session_tag: string | null;
}

const AGENT_OPTIONS: Array<{ value: AgentType; label: string }> = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "aider", label: "Aider" },
  { value: "gemini-cli", label: "Gemini CLI" },
];

const METRIC_OPTIONS: Array<{ value: string; direction: MetricDirection; label: string }> = [
  { value: "val_bpb", direction: "lower", label: "BPB (lower = better)" },
  { value: "f1_pct", direction: "higher", label: "F1 % (higher = better)" },
  { value: "accuracy", direction: "higher", label: "Accuracy (higher = better)" },
  { value: "loss", direction: "lower", label: "Loss (lower = better)" },
];

const TAG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  seedFrom?: Session | null;
  suggestedConfig?: SuggestedSessionConfig | null;
}

interface FormState {
  tag: string;
  agent_type: AgentType;
  strategy: string;
  gpu: string;
  metric: string;
  customMetricName: string;
  customMetricDirection: MetricDirection;
}

export function NewSessionModal({
  open,
  onClose,
  seedFrom,
  suggestedConfig,
}: NewSessionModalProps) {
  const setSessions = useSessionStore((s) => s.setSessions);
  const selectSession = useSessionStore((s) => s.selectSession);
  const setView = useSessionStore((s) => s.setView);

  const [form, setForm] = useState<FormState>({
    tag: "",
    agent_type: "claude-code",
    strategy: "",
    gpu: "auto",
    metric: "val_bpb",
    customMetricName: "",
    customMetricDirection: "higher",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [gpus, setGpus] = useState<GpuInfo[]>([]);

  const tagRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setErrors({});
      setServerError(null);
      setSubmitting(false);

      if (seedFrom) {
        const isPreset = METRIC_OPTIONS.some((m) => m.value === seedFrom.metric_name);
        setForm({
          tag: "",
          agent_type: seedFrom.agent_type,
          strategy: seedFrom.strategy,
          gpu: "auto",
          metric: isPreset ? seedFrom.metric_name : "custom",
          customMetricName: isPreset ? "" : seedFrom.metric_name,
          customMetricDirection: seedFrom.metric_direction,
        });
      } else if (suggestedConfig) {
        const metricName = suggestedConfig.metric_name ?? "";
        const isPreset = METRIC_OPTIONS.some((m) => m.value === metricName);
        const validAgents = AGENT_OPTIONS.map((a) => a.value) as string[];
        setForm({
          tag: suggestedConfig.tag ?? "",
          agent_type: (validAgents.includes(suggestedConfig.agent_type ?? "")
            ? suggestedConfig.agent_type
            : "claude-code") as AgentType,
          strategy: suggestedConfig.strategy ?? "",
          gpu: suggestedConfig.gpu ?? "auto",
          metric: metricName ? (isPreset ? metricName : "custom") : "val_bpb",
          customMetricName: metricName && !isPreset ? metricName : "",
          customMetricDirection: suggestedConfig.metric_direction ?? "higher",
        });
      } else {
        setForm({
          tag: "",
          agent_type: "claude-code",
          strategy: "",
          gpu: "auto",
          metric: "val_bpb",
          customMetricName: "",
          customMetricDirection: "higher",
        });
      }

      fetch(apiUrl("/api/gpus"))
        .then((r) => r.ok ? r.json() as Promise<GpuInfo[]> : Promise.resolve([]))
        .then(setGpus)
        .catch(() => setGpus([]));

      setTimeout(() => tagRef.current?.focus(), 50);
    }
  }, [open, seedFrom, suggestedConfig]);

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

    if (form.metric === "custom") {
      if (!form.customMetricName.trim()) {
        next.customMetricName = "Metric name is required";
      } else if (!/^[a-z0-9_]+$/.test(form.customMetricName.trim())) {
        next.customMetricName = "Lowercase alphanumeric and underscores only (e.g. mrr_at_5)";
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
        let metricName: string;
        let metricDirection: MetricDirection;

        if (form.metric === "custom") {
          metricName = form.customMetricName.trim();
          metricDirection = form.customMetricDirection;
        } else {
          const selectedMetric = METRIC_OPTIONS.find((m) => m.value === form.metric)
            ?? METRIC_OPTIONS[0];
          metricName = selectedMetric.value;
          metricDirection = selectedMetric.direction;
        }

        const body: Record<string, unknown> = {
          tag: form.tag,
          agent_type: form.agent_type,
          strategy: form.strategy,
          metric_name: metricName,
          metric_direction: metricDirection,
        };

        if (form.gpu !== "auto") {
          body.gpu_index = Number(form.gpu);
        }

        if (seedFrom) {
          body.seed_from = seedFrom.id;
        }

        const res = await fetch(apiUrl("/api/sessions"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setServerError(data.error ?? `Request failed (${res.status})`);
          return;
        }

        const listRes = await fetch(apiUrl("/api/sessions"));
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

        {!seedFrom && suggestedConfig && (
          <div
            className="mb-4 rounded border border-dashed px-3 py-2 text-xs"
            style={{
              borderColor: "var(--color-accent)",
              color: "var(--color-text-secondary)",
            }}
          >
            Pre-filled by{" "}
            <span
              className="font-bold"
              style={{ color: "var(--color-accent)" }}
            >
              assistant suggestion
            </span>
            {" "}— review and adjust before creating.
          </div>
        )}

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
              htmlFor="session-tag"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Tag
            </label>
            <input
              id="session-tag"
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
            <span
              id="agent-type-label"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Agent
            </span>
            <div
              role="group"
              aria-labelledby="agent-type-label"
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
              htmlFor="session-strategy"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Strategy
            </label>
            <textarea
              id="session-strategy"
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
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={form.gpu !== "auto"}
                onChange={(e) => {
                  if (e.target.checked) {
                    const firstFree = gpus.find((g) => g.session_tag === null);
                    setField("gpu", firstFree ? String(firstFree.index) : "0");
                  } else {
                    setField("gpu", "auto");
                  }
                }}
                className="rounded"
                style={{ accentColor: "var(--color-accent)" }}
              />
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Assign specific GPU
              </span>
              {form.gpu === "auto" && gpus.length > 0 && (
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  ({gpus.filter((g) => g.session_tag === null).length}/{gpus.length} free)
                </span>
              )}
            </label>
            {form.gpu !== "auto" && (
              <>
                <label htmlFor="gpu-select" className="sr-only">Select GPU</label>
                <select
                  id="gpu-select"
                  value={form.gpu}
                  onChange={(e) => setField("gpu", e.target.value)}
                  className="mt-2 w-full rounded border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
                  style={{
                    backgroundColor: "var(--color-bg)",
                    borderColor: errors.gpu
                      ? "var(--color-error)"
                      : "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {gpus.map((gpu) => (
                    <option
                      key={gpu.index}
                      value={String(gpu.index)}
                      disabled={gpu.session_tag !== null}
                    >
                      GPU {gpu.index}: {gpu.name} ({Math.round(gpu.memory_total_mb / 1024)}GB)
                      {gpu.session_tag ? ` — in use by ${gpu.session_tag}` : " — free"}
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
              </>
            )}
          </div>

          {/* Metric */}
          <div>
            <label
              htmlFor="session-metric"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Metric
            </label>
            <select
              id="session-metric"
              value={form.metric}
              onChange={(e) => setField("metric", e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: "var(--color-bg)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              {METRIC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">Custom metric...</option>
            </select>
          </div>

          {/* Custom Metric Fields */}
          {form.metric === "custom" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  htmlFor="custom-metric-name"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Metric Name
                </label>
                <input
                  id="custom-metric-name"
                  type="text"
                  value={form.customMetricName}
                  onChange={(e) => setField("customMetricName", e.target.value)}
                  placeholder="e.g. mrr_at_5, bleu_score, ndcg"
                  className="w-full rounded border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
                  style={{
                    backgroundColor: "var(--color-bg)",
                    borderColor: errors.customMetricName
                      ? "var(--color-error)"
                      : "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
                {errors.customMetricName && (
                  <div
                    className="mt-1 text-xs"
                    style={{ color: "var(--color-error)" }}
                  >
                    {errors.customMetricName}
                  </div>
                )}
              </div>
              <div className="w-40">
                <span
                  id="metric-direction-label"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Direction
                </span>
                <div
                  role="group"
                  aria-labelledby="metric-direction-label"
                  className="flex rounded border"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <button
                    type="button"
                    className="flex-1 px-2 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor:
                        form.customMetricDirection === "higher"
                          ? "var(--color-accent)"
                          : "transparent",
                      color:
                        form.customMetricDirection === "higher"
                          ? "var(--color-bg)"
                          : "var(--color-text-secondary)",
                    }}
                    onClick={() => setField("customMetricDirection", "higher")}
                  >
                    Higher
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-2 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor:
                        form.customMetricDirection === "lower"
                          ? "var(--color-accent)"
                          : "transparent",
                      color:
                        form.customMetricDirection === "lower"
                          ? "var(--color-bg)"
                          : "var(--color-text-secondary)",
                    }}
                    onClick={() => setField("customMetricDirection", "lower")}
                  >
                    Lower
                  </button>
                </div>
              </div>
            </div>
          )}

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
