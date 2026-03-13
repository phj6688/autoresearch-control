import simpleGit from "simple-git";
import path from "node:path";
import fs from "node:fs/promises";
import type {
  Experiment,
  GitCommit,
  WorktreeInfo,
  DiffStat,
} from "./types";
import { GitWorktreeError, GitBranchError } from "./types";

const repoLocks = new Map<string, Promise<unknown>>();

function withMutex<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = repoLocks.get(repoPath) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  repoLocks.set(repoPath, next);
  return next;
}

function gitFor(dir: string) {
  return simpleGit({ baseDir: dir, binary: "git", maxConcurrentProcesses: 1 });
}

export function createWorktree(
  repoPath: string,
  worktreeDir: string,
  tag: string
): Promise<string> {
  return withMutex(repoPath, async () => {
    const worktreePath = path.join(worktreeDir, tag);
    const branch = `autoresearch/${tag}`;
    const git = gitFor(repoPath);
    try {
      await git.raw([
        "worktree",
        "add",
        worktreePath,
        "-b",
        branch,
        "master",
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        throw new GitBranchError(
          `Branch ${branch} already exists. Choose a different tag.`
        );
      }
      throw new GitWorktreeError(`Failed to create worktree: ${msg}`);
    }
    return worktreePath;
  });
}

export function deleteWorktree(
  repoPath: string,
  worktreePath: string
): Promise<void> {
  return withMutex(repoPath, async () => {
    const git = gitFor(repoPath);
    try {
      await git.raw(["worktree", "remove", worktreePath, "--force"]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new GitWorktreeError(`Failed to remove worktree: ${msg}`);
    }
  });
}

export function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  return withMutex(repoPath, async () => {
    const git = gitFor(repoPath);
    const raw = await git.raw(["worktree", "list", "--porcelain"]);
    const trees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of raw.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) {
          trees.push({
            path: current.path,
            head: current.head ?? "",
            branch: current.branch ?? null,
          });
        }
        current = { path: line.slice("worktree ".length) };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice("branch ".length).replace("refs/heads/", "");
      }
    }

    if (current.path) {
      trees.push({
        path: current.path,
        head: current.head ?? "",
        branch: current.branch ?? null,
      });
    }

    return trees;
  });
}

export function getBranchLog(
  worktreePath: string,
  limit = 20
): Promise<GitCommit[]> {
  const git = gitFor(worktreePath);
  return git.log({ maxCount: limit }).then((log) =>
    log.all.map((entry) => ({
      hash: entry.hash,
      message: entry.message,
    }))
  );
}

export function getBestCommitHash(
  experiments: Experiment[]
): string | null {
  let best: Experiment | null = null;
  for (const exp of experiments) {
    if (exp.committed && exp.git_hash) {
      if (!best || exp.val_bpb < best.val_bpb) {
        best = exp;
      }
    }
  }
  return best?.git_hash ?? null;
}

export function seedTrainPy(
  sourceWorktree: string,
  targetWorktree: string
): Promise<void> {
  const repoPath = targetWorktree;
  return withMutex(repoPath, async () => {
    const src = path.join(sourceWorktree, "train.py");
    const dst = path.join(targetWorktree, "train.py");
    try {
      await fs.copyFile(src, dst);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new GitWorktreeError(`Failed to copy train.py: ${msg}`);
    }
    const git = gitFor(targetWorktree);
    await git.add("train.py");
    await git.commit("seed from source session best train.py");
  });
}

export function getCommitDiffStats(
  worktreePath: string,
  hash: string
): Promise<DiffStat> {
  const git = gitFor(worktreePath);
  return git
    .raw(["diff", "--numstat", `${hash}~1`, hash])
    .then((raw) => {
      const files: DiffStat["files"] = [];
      let totalInsertions = 0;
      let totalDeletions = 0;

      for (const line of raw.trim().split("\n")) {
        if (!line) continue;
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const insertions = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
        const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
        const file = parts[2];
        if (isNaN(insertions) || isNaN(deletions)) continue;
        files.push({ file, insertions, deletions });
        totalInsertions += insertions;
        totalDeletions += deletions;
      }

      return { files, totalInsertions, totalDeletions };
    })
    .catch(() => ({ files: [], totalInsertions: 0, totalDeletions: 0 }));
}
