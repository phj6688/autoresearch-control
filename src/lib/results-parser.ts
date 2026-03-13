import type { ParsedExperiment } from "./types";

export function parseResultsTsv(content: string): ParsedExperiment[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const results: ParsedExperiment[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split("\t");
    if (parts.length < 4) continue;

    const runNumber = parseInt(parts[0], 10);
    const tag = parts[1] ?? "";
    const description = parts[2] ?? "";
    const valBpb = parseFloat(parts[3]);

    if (isNaN(runNumber) || isNaN(valBpb)) continue;

    const peakVramMb =
      parts.length >= 5 ? parseFloat(parts[4]) : null;

    results.push({
      run_number: runNumber,
      tag,
      description,
      val_bpb: valBpb,
      peak_vram_mb: peakVramMb !== null && isNaN(peakVramMb) ? null : peakVramMb,
    });
  }

  return results;
}
