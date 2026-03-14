"use client";

import { useRef, useEffect, useMemo } from "react";
import * as d3 from "d3";
import type { Session, Experiment, MetricDirection } from "@/lib/types";
import { findBestIndex, metricLabel } from "@/lib/metric-utils";

const COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb923c"];
const FONT = "'JetBrains Mono', monospace";
const MARGIN = { top: 16, right: 100, bottom: 40, left: 56 };

interface ProgressChartProps {
  sessions: Session[];
  experimentsBySession: Record<string, Experiment[]>;
}

export function ProgressChart({
  sessions,
  experimentsBySession,
}: ProgressChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: 560, height: 220 });

  const dataKey = useMemo(() => {
    let key = "";
    for (const s of sessions) {
      const exps = experimentsBySession[s.id];
      key += `${s.id}:${exps?.length ?? 0};`;
    }
    return key;
  }, [sessions, experimentsBySession]);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function draw() {
      if (!svg) return;
      const { width, height } = sizeRef.current;
      const w = width - MARGIN.left - MARGIN.right;
      const h = height - MARGIN.top - MARGIN.bottom;

      const root = d3.select(svg);
      root.selectAll("*").remove();
      root.attr("width", width).attr("height", height);

      const g = root
        .append("g")
        .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

      let allValues: number[] = [];
      let maxLen = 0;
      for (const s of sessions) {
        const exps = experimentsBySession[s.id] ?? [];
        if (exps.length > maxLen) maxLen = exps.length;
        for (const e of exps) allValues.push(e.val_bpb);
      }

      if (allValues.length === 0) {
        g.append("text")
          .attr("x", w / 2)
          .attr("y", h / 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#475569")
          .attr("font-family", FONT)
          .attr("font-size", 12)
          .text("No experiment data");
        return;
      }

      const direction: MetricDirection = sessions[0]?.metric_direction ?? "lower";
      const metricName = sessions[0]?.metric_name ?? "val_bpb";
      const padding = metricName === "f1_pct" ? 2 : 0.005;
      const yMin = d3.min(allValues)! - padding;
      const yMax = d3.max(allValues)! + padding;

      const xScale = d3.scaleLinear().domain([0, Math.max(maxLen - 1, 1)]).range([0, w]);
      const yDomain = direction === "higher" ? [yMin, yMax] : [yMax, yMin];
      const yScale = d3.scaleLinear().domain(yDomain).range([h, 0]);

      // Y grid lines
      const yTicks = yScale.ticks(5);
      for (const tick of yTicks) {
        g.append("line")
          .attr("x1", 0)
          .attr("x2", w)
          .attr("y1", yScale(tick))
          .attr("y2", yScale(tick))
          .attr("stroke", "#1e293b")
          .attr("stroke-dasharray", "2,3");
        g.append("text")
          .attr("x", -8)
          .attr("y", yScale(tick))
          .attr("dy", "0.35em")
          .attr("text-anchor", "end")
          .attr("fill", "#94a3b8")
          .attr("font-family", FONT)
          .attr("font-size", 10)
          .text(metricName === "f1_pct" ? tick.toFixed(0) + "%" : tick.toFixed(3));
      }

      // X axis labels
      const xTicks = xScale.ticks(Math.min(maxLen, 8));
      for (const tick of xTicks) {
        g.append("text")
          .attr("x", xScale(tick))
          .attr("y", h + 20)
          .attr("text-anchor", "middle")
          .attr("fill", "#94a3b8")
          .attr("font-family", FONT)
          .attr("font-size", 10)
          .text(Math.round(tick).toString());
      }

      // Axis titles
      g.append("text")
        .attr("x", w / 2)
        .attr("y", h + 34)
        .attr("text-anchor", "middle")
        .attr("fill", "#475569")
        .attr("font-family", FONT)
        .attr("font-size", 10)
        .text("experiment #");

      g.append("text")
        .attr("transform", `rotate(-90)`)
        .attr("x", -h / 2)
        .attr("y", -44)
        .attr("text-anchor", "middle")
        .attr("fill", "#475569")
        .attr("font-family", FONT)
        .attr("font-size", 10)
        .text(metricLabel(metricName));

      // Lines per session
      sessions.forEach((session, si) => {
        const exps = experimentsBySession[session.id] ?? [];
        if (exps.length === 0) return;
        const color = COLORS[si % COLORS.length];

        const line = d3
          .line<Experiment>()
          .x((_, i) => xScale(i))
          .y((d) => yScale(d.val_bpb));

        g.append("path")
          .datum(exps)
          .attr("d", line)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 1.5);

        // Data points
        const bestIdx = findBestIndex(
          exps.map((e) => e.val_bpb),
          direction
        );

        for (let i = 0; i < exps.length; i++) {
          const exp = exps[i];
          if (exp.committed) {
            g.append("circle")
              .attr("cx", xScale(i))
              .attr("cy", yScale(exp.val_bpb))
              .attr("r", 2)
              .attr("fill", color);
          }
        }

        // Best per session — gold ring
        g.append("circle")
          .attr("cx", xScale(bestIdx))
          .attr("cy", yScale(exps[bestIdx].val_bpb))
          .attr("r", 4)
          .attr("fill", "none")
          .attr("stroke", "#f59e0b")
          .attr("stroke-width", 1.5);

        // Session tag label at line end
        const lastExp = exps[exps.length - 1];
        g.append("text")
          .attr("x", xScale(exps.length - 1) + 6)
          .attr("y", yScale(lastExp.val_bpb))
          .attr("dy", "0.35em")
          .attr("fill", color)
          .attr("font-family", FONT)
          .attr("font-size", 10)
          .text(session.tag);
      });
    }

    const observer = new ResizeObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (container) {
          sizeRef.current = {
            width: container.clientWidth,
            height: Math.max(220, Math.min(container.clientWidth * 0.4, 400)),
          };
          draw();
        }
      }, 100);
    });

    observer.observe(container);
    sizeRef.current = {
      width: container.clientWidth,
      height: Math.max(220, Math.min(container.clientWidth * 0.4, 400)),
    };
    draw();

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [dataKey, sessions, experimentsBySession]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
}
