import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import type { SpawnConfig } from "./types";
import { ProcessManagerError } from "./types";

const execFileAsync = promisify(execFile);

const AGENT_COMMANDS: Record<string, string> = {
  "claude-code":
    'claude --model claude-opus-4-6 --print "Read program.md and begin autonomous experimentation. Setup first, then run experiments continuously."',
  codex: "codex --model o4-mini --auto-edit --full-auto",
  aider: "aider --model claude-3.5-sonnet train.py",
};

async function tmux(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", args, { timeout: 10000 });
    return stdout.trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      throw new ProcessManagerError(
        "tmux not found. Install with `apt install tmux`"
      );
    }
    throw err;
  }
}

export async function spawnSession(config: SpawnConfig): Promise<string> {
  const tmuxName = `autoresearch-${config.tag}`;

  const programPath = path.join(config.worktreePath, "program.md");
  await fs.writeFile(programPath, config.programMd, "utf-8");

  await tmux(
    "new-session",
    "-d",
    "-s",
    tmuxName,
    "-c",
    config.worktreePath
  );

  if (config.gpuIndex >= 0) {
    await tmux(
      "set-environment",
      "-t",
      tmuxName,
      "CUDA_VISIBLE_DEVICES",
      String(config.gpuIndex)
    );
  }

  const command =
    config.agentCommand ??
    AGENT_COMMANDS[config.agentType] ??
    config.agentCommand;

  if (!command) {
    throw new ProcessManagerError(
      `No command template for agent type: ${config.agentType}`
    );
  }

  const fullCommand = config.gpuIndex >= 0
    ? `CUDA_VISIBLE_DEVICES=${config.gpuIndex} ${command}`
    : command;
  await tmux("send-keys", "-t", tmuxName, fullCommand, "Enter");

  return tmuxName;
}

export async function getSessionPid(
  tmuxName: string
): Promise<number | null> {
  try {
    const output = await tmux(
      "list-panes",
      "-t",
      tmuxName,
      "-F",
      "#{pane_pid}"
    );
    const pid = parseInt(output.split("\n")[0], 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export async function pauseSession(tmuxName: string): Promise<void> {
  const pid = await getSessionPid(tmuxName);
  if (pid === null) {
    throw new ProcessManagerError(
      `Cannot find PID for tmux session: ${tmuxName}`
    );
  }
  try {
    await execFileAsync("kill", ["-STOP", `-${pid}`]);
  } catch {
    await execFileAsync("kill", ["-STOP", String(pid)]);
  }
}

export async function resumeSession(tmuxName: string): Promise<void> {
  const pid = await getSessionPid(tmuxName);
  if (pid === null) {
    throw new ProcessManagerError(
      `Cannot find PID for tmux session: ${tmuxName}`
    );
  }
  try {
    await execFileAsync("kill", ["-CONT", `-${pid}`]);
  } catch {
    await execFileAsync("kill", ["-CONT", String(pid)]);
  }
}

export async function killSession(tmuxName: string): Promise<void> {
  const pid = await getSessionPid(tmuxName);

  if (pid !== null) {
    try {
      await execFileAsync("kill", ["-TERM", String(pid)]);
    } catch {
      /* process may already be gone */
    }

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        await execFileAsync("kill", ["-0", String(pid)]);
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    try {
      await execFileAsync("kill", ["-0", String(pid)]);
      await execFileAsync("kill", ["-KILL", String(pid)]);
    } catch {
      /* already dead */
    }
  }

  try {
    await tmux("kill-session", "-t", tmuxName);
  } catch {
    /* session may already be gone */
  }
}

export async function isSessionAlive(tmuxName: string): Promise<boolean> {
  try {
    await tmux("has-session", "-t", tmuxName);
    return true;
  } catch {
    return false;
  }
}
