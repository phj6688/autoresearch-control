import { getGpuStatus } from "../src/lib/gpu";

async function main() {
  const gpus = await getGpuStatus();

  if (!Array.isArray(gpus)) {
    process.exit(1);
  }

  // On machines without nvidia-smi, should return empty array gracefully
  // On machines with nvidia-smi, should return GpuInfo[]
  for (const gpu of gpus) {
    if (
      typeof gpu.index !== "number" ||
      typeof gpu.name !== "string" ||
      typeof gpu.memory_total_mb !== "number"
    ) {
      process.exit(1);
    }
  }

  process.exit(0);
}

void main();
