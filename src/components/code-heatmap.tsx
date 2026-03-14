"use client";

import type { Experiment } from "@/lib/types";

interface CodeRegion {
  label: string;
  range: string;
  keywords: string[];
}

const REGIONS: CodeRegion[] = [
  { label: "Model Config", range: "L1-45", keywords: ["config", "model", "dim", "n_layer", "n_head", "vocab"] },
  { label: "Attention", range: "L46-120", keywords: ["attention", "attn", "qkv", "softmax", "flash", "rope"] },
  { label: "MLP/FFN", range: "L121-180", keywords: ["mlp", "ffn", "feedforward", "gelu", "swiglu", "linear"] },
  { label: "Embeddings", range: "L181-220", keywords: ["embed", "embedding", "token", "position", "wte", "wpe"] },
  { label: "Optimizer", range: "L221-350", keywords: ["optim", "adam", "muon", "weight_decay", "momentum", "lr"] },
  { label: "LR Schedule", range: "L351-400", keywords: ["schedule", "warmup", "cosine", "decay", "learning_rate"] },
  { label: "Training Loop", range: "L401-520", keywords: ["train", "step", "batch", "grad", "backward", "loss", "forward"] },
  { label: "Eval/Logging", range: "L521-630", keywords: ["eval", "val", "log", "save", "checkpoint", "metric"] },
];

function barColor(heat: number): string {
  if (heat > 0.7) return "var(--color-error)";
  if (heat > 0.4) return "var(--color-warning)";
  return "var(--color-accent)";
}

// Keyword-based heat derivation from committed experiment change_summary.
// TODO: swap for git diff stats per-region when API is available.
function computeHeat(experiments: Experiment[]): number[] {
  const committed = experiments.filter((e) => e.committed !== 0);
  if (committed.length === 0) return REGIONS.map(() => 0);

  const counts = REGIONS.map((region) => {
    let count = 0;
    for (const exp of committed) {
      const text = (exp.change_summary ?? "").toLowerCase();
      for (const kw of region.keywords) {
        if (text.includes(kw)) {
          count++;
          break;
        }
      }
    }
    return count;
  });

  const maxCount = Math.max(...counts, 1);
  return counts.map((c) => c / maxCount);
}

interface CodeHeatmapProps {
  experiments: Experiment[];
}

export function CodeHeatmap({ experiments }: CodeHeatmapProps) {
  const heats = computeHeat(experiments);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Mutation Heatmap — train.py
        </div>
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "var(--color-text-muted)" }}
          title="Frequency of agent edits per code region based on committed change summaries"
        >
          <span style={{ color: "var(--color-accent)" }}>Low</span>
          <span style={{ color: "var(--color-warning)" }}>Mid</span>
          <span style={{ color: "var(--color-error)" }}>High</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {REGIONS.map((region, i) => (
          <div key={region.label} className="flex items-center gap-2">
            <div
              className="w-24 shrink-0 truncate text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {region.label}
            </div>
            <div
              className="h-3 flex-1 overflow-hidden rounded-sm"
              style={{ backgroundColor: "var(--color-border)" }}
            >
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{
                  width: `${Math.max(heats[i] * 100, 2)}%`,
                  backgroundColor: barColor(heats[i]),
                  opacity: heats[i] > 0 ? 1 : 0.3,
                }}
              />
            </div>
            <span
              className="w-14 shrink-0 text-right text-xs tabular-nums"
              style={{ color: "var(--color-text-muted)" }}
            >
              {region.range}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
