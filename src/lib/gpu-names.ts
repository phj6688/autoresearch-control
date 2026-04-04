/**
 * Static lookup table mapping GPU PCI device IDs to human-readable names.
 * Fallback format: "GPU {index} — Unknown ({hex_id})"
 */

const GPU_NAMES: Map<string, string> = new Map([
  // NVIDIA Consumer
  ["0x2684", "RTX 4090"],
  ["0x2702", "RTX 4090 D"],
  ["0x2704", "RTX 4080 SUPER"],
  ["0x2782", "RTX 4080"],
  ["0x2786", "RTX 4070 Ti SUPER"],
  ["0x2803", "RTX 4070 Ti"],
  ["0x2882", "RTX 4070 SUPER"],
  ["0x2886", "RTX 4070"],
  ["0x2901", "RTX 4060 Ti"],
  ["0x2939", "RTX 4060"],
  ["0x2203", "RTX 3090 Ti"],
  ["0x2204", "RTX 3090"],
  ["0x2206", "RTX 3080 Ti"],
  ["0x2208", "RTX 3080 12GB"],
  ["0x2216", "RTX 3080"],
  ["0x2484", "RTX 3070 Ti"],
  ["0x2488", "RTX 3070"],
  ["0x2503", "RTX 3060 Ti"],
  ["0x2504", "RTX 3060"],
  ["0x2507", "RTX 3050"],

  // NVIDIA Data Center / Professional
  ["0x2330", "H100 SXM"],
  ["0x2331", "H100 PCIe"],
  ["0x2324", "H100 NVL"],
  ["0x26b5", "L40S"],
  ["0x26b9", "L40"],
  ["0x27b8", "L4"],
  ["0x20b0", "A100 SXM 80GB"],
  ["0x20b2", "A100 PCIe 80GB"],
  ["0x20b5", "A100 PCIe 40GB"],
  ["0x20f1", "A100 SXM 40GB"],
  ["0x25b6", "A16"],
  ["0x2236", "A10"],
  ["0x2237", "A10G"],
  ["0x20b7", "A30"],
  ["0x1db1", "V100 SXM2 16GB"],
  ["0x1db4", "V100 PCIe 16GB"],
  ["0x1db5", "V100 SXM2 32GB"],
  ["0x1db6", "V100 PCIe 32GB"],
  ["0x1e30", "T4"],
  ["0x1eb8", "T4"],
  ["0x15f7", "P100 SXM2"],
  ["0x15f8", "P100 PCIe 12GB"],
  ["0x15f9", "P100 PCIe 16GB"],
  ["0x1b38", "P40"],
  ["0x1586", "P106-100"],

  // NVIDIA RTX Pro
  ["0x2230", "RTX A6000"],
  ["0x2231", "RTX A5000"],
  ["0x2233", "RTX A5500"],
  ["0x2235", "A40"],

  // AMD Instinct
  ["0x740c", "MI250X"],
  ["0x740f", "MI250"],
  ["0x7408", "MI210"],
  ["0x738c", "MI100"],
  ["0x74a1", "MI300X"],
]);

export function resolveGpuName(
  hexId: string,
  index: number,
  rawName?: string
): string {
  const friendly = GPU_NAMES.get(hexId.toLowerCase());
  if (friendly) return friendly;
  if (rawName && rawName !== hexId) return rawName;
  return `GPU ${index} \u2014 Unknown (${hexId})`;
}

export function gpuTooltip(
  hexId: string,
  index: number,
  rawName?: string
): string {
  const friendly = GPU_NAMES.get(hexId.toLowerCase());
  const display = friendly ?? rawName ?? "Unknown";
  return `GPU ${index}: ${display} (PCI ID: ${hexId})`;
}
