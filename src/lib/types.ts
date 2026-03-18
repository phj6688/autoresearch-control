export type SessionStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "killed";

export type AgentType = "claude-code" | "codex" | "aider" | "gemini-cli";

export type MetricDirection = "lower" | "higher";

export interface Session {
  id: string;
  tag: string;
  status: SessionStatus;
  gpu_index: number | null;
  agent_type: AgentType;
  strategy: string;
  branch: string;
  worktree_path: string | null;
  seed_from: string | null;
  tmux_session: string | null;
  program_md: string | null;
  best_val_bpb: number | null;
  experiment_count: number;
  commit_count: number;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
  updated_at: number;
  metric_name: string;
  metric_direction: MetricDirection;
  last_output_snapshot: string | null;
  last_summary: string | null;
  restart_count: number;
  last_restart_at: number | null;
}

export interface Experiment {
  id: number;
  session_id: string;
  run_number: number;
  val_bpb: number;
  peak_vram_mb: number | null;
  duration_s: number | null;
  committed: number;
  change_summary: string | null;
  git_hash: string | null;
  delta: number | null;
  log_tail: string | null;
  created_at: number;
}

export interface GpuInfo {
  index: number;
  name: string;
  memory_total_mb: number;
  memory_used_mb: number;
  utilization_pct: number;
  temperature_c: number;
}

export interface GpuAssignment {
  gpu_index: number;
  session_id: string | null;
  assigned_at: number | null;
}

export type AlertType = "breakthrough" | "failure" | "completed" | "stall";

export interface Alert {
  id: number;
  session_id: string;
  type: AlertType;
  message: string;
  sent: number;
  created_at: number;
}

export type SSEEvent =
  | { type: "experiment"; sessionId: string; experiment: Experiment }
  | { type: "session-status"; sessionId: string; status: SessionStatus }
  | { type: "gpu-update"; gpus: GpuInfo[] }
  | { type: "alert"; alert: Alert }
  | { type: "health-event"; event: SessionEvent }
  | { type: "heartbeat" };

export interface CreateSessionInput {
  tag: string;
  agent_type: AgentType;
  strategy: string;
  gpu_index?: number | null;
  seed_from?: string | null;
  program_md?: string | null;
  agent_command_override?: string | null;
  metric_name?: string;
  metric_direction?: MetricDirection;
}

export interface PatchSessionInput {
  action: "pause" | "resume" | "restart" | "kill";
}

export interface ForkSessionInput {
  tag: string;
  strategy?: string;
  gpu_index?: number | null;
}

export interface SpawnConfig {
  tag: string;
  worktreePath: string;
  gpuIndex: number;
  agentType: AgentType;
  agentCommand?: string;
  programMd: string;
}

export interface WatcherHandle {
  stop: () => void;
}

export interface GitCommit {
  hash: string;
  message: string;
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
}

export interface DiffStat {
  files: Array<{ file: string; insertions: number; deletions: number }>;
  totalInsertions: number;
  totalDeletions: number;
}

export class ProcessManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessManagerError";
  }
}

export class GitWorktreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitWorktreeError";
  }
}

export class GitBranchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitBranchError";
  }
}

export interface ParsedExperiment {
  run_number: number;
  tag: string;
  description: string;
  val_bpb: number;
  peak_vram_mb: number | null;
}

export type ActivityType =
  | "modifying"
  | "experimenting"
  | "evaluating"
  | "thinking"
  | "committing"
  | "error"
  | "reading"
  | "idle";

export interface ActivityEvent {
  ts: number;
  type: ActivityType;
  message: string;
}

export type ActivityStatus =
  | "experimenting"
  | "modifying"
  | "evaluating"
  | "thinking"
  | "idle"
  | "error";

export interface ActivitySnapshot {
  status: ActivityStatus;
  summary: string;
  events: ActivityEvent[];
  rawOutput: string;
  modifiedFiles: string[];
  lastActivityAt: number;
}

export type SessionEventType =
  | "started"
  | "orphan_detected"
  | "auto_restarted"
  | "restart_failed"
  | "escalation_triggered"
  | "escalation_resolved"
  | "killed"
  | "completed"
  | "paused"
  | "resumed"
  | "experiment_recorded"
  | "snapshot_captured";

export interface SessionEvent {
  id: number;
  session_id: string;
  type: SessionEventType;
  message: string;
  details: string | null;
  created_at: number;
}
