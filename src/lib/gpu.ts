import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import type { GpuInfo } from "./types";

const execFileAsync = promisify(execFile);

async function readSysfs(filePath: string): Promise<string | null> {
  try {
    return (await fs.promises.readFile(filePath, "utf-8")).trim();
  } catch {
    return null;
  }
}

async function getAmdGpus(): Promise<GpuInfo[]> {
  const drmBase = "/sys/class/drm";
  const gpus: GpuInfo[] = [];

  let entries: string[];
  try {
    entries = await fs.promises.readdir(drmBase);
  } catch {
    return [];
  }

  const cardDirs = entries
    .filter((e) => /^card\d+$/.test(e))
    .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));

  let gpuIndex = 0;
  for (const card of cardDirs) {
    const deviceDir = path.join(drmBase, card, "device");
    const busyPath = path.join(deviceDir, "gpu_busy_percent");

    const busyStr = await readSysfs(busyPath);
    if (busyStr === null) continue;

    const vramTotal = await readSysfs(path.join(deviceDir, "mem_info_vram_total"));
    const vramUsed = await readSysfs(path.join(deviceDir, "mem_info_vram_used"));

    let temperature = 0;
    const hwmonDir = path.join(deviceDir, "hwmon");
    try {
      const hwmons = await fs.promises.readdir(hwmonDir);
      for (const hm of hwmons) {
        const tempStr = await readSysfs(path.join(hwmonDir, hm, "temp1_input"));
        if (tempStr !== null) {
          temperature = Math.round(parseInt(tempStr, 10) / 1000);
          break;
        }
      }
    } catch {
      /* no hwmon */
    }

    const productName = await readSysfs(path.join(deviceDir, "product_name"));
    const deviceId = await readSysfs(path.join(deviceDir, "device"));
    const name = productName ?? `AMD GPU ${deviceId ?? card}`;

    const totalMb = vramTotal ? Math.round(parseInt(vramTotal, 10) / 1048576) : 0;
    const usedMb = vramUsed ? Math.round(parseInt(vramUsed, 10) / 1048576) : 0;

    gpus.push({
      index: gpuIndex,
      name,
      memory_total_mb: totalMb,
      memory_used_mb: usedMb,
      utilization_pct: parseInt(busyStr, 10) || 0,
      temperature_c: temperature,
    });
    gpuIndex++;
  }

  return gpus;
}

async function getNvidiaGpus(): Promise<GpuInfo[]> {
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

export async function getGpuStatus(): Promise<GpuInfo[]> {
  const nvidia = await getNvidiaGpus();
  if (nvidia.length > 0) return nvidia;

  return getAmdGpus();
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
