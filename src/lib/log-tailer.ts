import fs from "node:fs/promises";
import path from "node:path";

export async function tailRunLog(
  worktreePath: string,
  lines = 20
): Promise<string> {
  const logPath = path.join(worktreePath, "run.log");
  try {
    const content = await fs.readFile(logPath, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).join("\n");
  } catch {
    return "";
  }
}

export type ExperimentLogStatus =
  | "training"
  | "evaluating"
  | "idle"
  | "error";

export function detectExperimentStatus(
  logContent: string
): ExperimentLogStatus {
  if (!logContent.trim()) return "idle";

  const lower = logContent.toLowerCase();

  if (/error|exception|traceback|fatal/i.test(lower)) {
    return "error";
  }

  if (/evaluating|eval|val_bpb/i.test(lower)) {
    return "evaluating";
  }

  if (/training|step\s+\d|loss[:\s]/i.test(lower)) {
    return "training";
  }

  return "idle";
}
