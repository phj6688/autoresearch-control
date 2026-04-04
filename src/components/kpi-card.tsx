interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  trend?: "up" | "down" | "flat";
  tooltip?: string;
  children?: React.ReactNode;
}

function TrendArrow({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "flat") {
    return (
      <span
        className="text-xs"
        style={{ color: "var(--color-text-muted)" }}
        aria-label="No change"
      >
        →
      </span>
    );
  }
  const isUp = trend === "up";
  return (
    <span
      className="text-xs"
      style={{ color: isUp ? "var(--color-success)" : "var(--color-error)" }}
      aria-label={isUp ? "Trending up" : "Trending down"}
    >
      {isUp ? "↑" : "↓"}
    </span>
  );
}

export function KpiCard({ label, value, unit, trend, tooltip, children }: KpiCardProps) {
  return (
    <div
      className="flex shrink-0 items-baseline gap-2"
      title={tooltip}
    >
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      {children ?? (
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: "var(--color-text-primary)" }}
        >
          {value}
          {unit && (
            <span
              className="ml-0.5 text-xs font-normal"
              style={{ color: "var(--color-text-muted)" }}
            >
              {unit}
            </span>
          )}
        </span>
      )}
      {trend && <TrendArrow trend={trend} />}
    </div>
  );
}
