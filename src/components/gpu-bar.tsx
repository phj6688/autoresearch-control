"use client";

import { useSessionStore } from "@/stores/session-store";
import { resolveGpuName, gpuTooltip } from "@/lib/gpu-names";

function utilizationColor(pct: number, idle: boolean): string {
  if (idle) return "var(--color-text-muted)";
  if (pct > 90) return "var(--color-error)";
  if (pct > 80) return "var(--color-warning)";
  return "var(--color-accent)";
}

interface GpuWithSession {
  index: number;
  name: string;
  memory_total_mb: number;
  memory_used_mb: number;
  utilization_pct: number;
  temperature_c: number;
  session_tag?: string | null;
}

export function GpuBar() {
  const gpus = useSessionStore((s) => s.gpus) as GpuWithSession[];

  if (gpus.length === 0) {
    return (
      <div className="mb-3 rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
        No GPUs detected
      </div>
    );
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        GPUs
      </div>
      {gpus.map((gpu) => {
        const isIdle = !gpu.session_tag;
        const barColor = utilizationColor(gpu.utilization_pct, isIdle);
        const vramPct =
          gpu.memory_total_mb > 0
            ? (gpu.memory_used_mb / gpu.memory_total_mb) * 100
            : 0;

        return (
          <div
            key={gpu.index}
            className="rounded border p-2"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
          >
            <div className="flex items-center justify-between text-xs">
              <span
                className="font-semibold"
                style={{ color: "var(--color-text-primary)" }}
                title={gpuTooltip(gpu.name, gpu.index)}
              >
                GPU {gpu.index}
              </span>
              <span style={{ color: "var(--color-text-muted)" }}>
                {gpu.temperature_c}°C
              </span>
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {resolveGpuName(gpu.name, gpu.index)}
            </div>
            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--color-border)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(vramPct, 100)}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span style={{ color: "var(--color-text-muted)" }}>
                {Math.round(vramPct)}% VRAM
              </span>
              <span
                className="truncate max-w-[100px]"
                style={{ color: isIdle ? "var(--color-text-muted)" : "var(--color-accent)" }}
              >
                {gpu.session_tag ?? "idle"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
