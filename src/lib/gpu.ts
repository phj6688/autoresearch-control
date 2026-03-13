import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GpuInfo } from "./types";

const execFileAsync = promisify(execFile);

export async function getGpuStatus(): Promise<GpuInfo[]> {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu",
        "--format=csv,noheader,nounits",
      ],
      { timeout: 5000 }
    );

    const gpus: GpuInfo[] = [];

    for (const line of stdout.trim().split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length < 6) continue;

      const index = parseInt(parts[0], 10);
      const name = parts[1];
      const memoryTotal = parseFloat(parts[2]);
      const memoryUsed = parseFloat(parts[3]);
      const utilization = parseFloat(parts[4]);
      const temperature = parseFloat(parts[5]);

      if (
        isNaN(index) ||
        isNaN(memoryTotal) ||
        isNaN(memoryUsed) ||
        isNaN(utilization) ||
        isNaN(temperature)
      ) {
        continue;
      }

      gpus.push({
        index,
        name,
        memory_total_mb: memoryTotal,
        memory_used_mb: memoryUsed,
        utilization_pct: utilization,
        temperature_c: temperature,
      });
    }

    return gpus;
  } catch {
    return [];
  }
}

export async function findFreeGpu(
  assignedGpus: number[]
): Promise<number | null> {
  const gpus = await getGpuStatus();
  const assigned = new Set(assignedGpus);
  for (const gpu of gpus) {
    if (!assigned.has(gpu.index)) {
      return gpu.index;
    }
  }
  return null;
}
