import { create } from "zustand";
import type { Session, SessionStatus, Experiment, GpuInfo } from "@/lib/types";

interface SessionStore {
  sessions: Session[];
  selectedId: string | null;
  compareIds: string[];
  view: "dashboard" | "compare";
  gpus: GpuInfo[];
  connected: boolean;

  setSessions: (sessions: Session[]) => void;
  selectSession: (id: string | null) => void;
  toggleCompare: (id: string) => void;
  setView: (view: "dashboard" | "compare") => void;
  setGpus: (gpus: GpuInfo[]) => void;
  setConnected: (connected: boolean) => void;
  addExperiment: (sessionId: string, experiment: Experiment) => void;
  updateSessionStatus: (sessionId: string, status: SessionStatus) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  selectedId: null,
  compareIds: [],
  view: "dashboard",
  gpus: [],
  connected: false,

  setSessions: (sessions) => set({ sessions }),

  selectSession: (id) => set({ selectedId: id }),

  toggleCompare: (id) =>
    set((state) => {
      const exists = state.compareIds.includes(id);
      return {
        compareIds: exists
          ? state.compareIds.filter((cid) => cid !== id)
          : [...state.compareIds, id],
      };
    }),

  setView: (view) => set({ view }),

  setGpus: (gpus) => set({ gpus }),

  setConnected: (connected) => set({ connected }),

  addExperiment: (sessionId, experiment) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const newCount = s.experiment_count + 1;
        const newCommitCount =
          experiment.committed ? s.commit_count + 1 : s.commit_count;
        const newBest =
          s.best_val_bpb === null || experiment.val_bpb < s.best_val_bpb
            ? experiment.val_bpb
            : s.best_val_bpb;
        return {
          ...s,
          experiment_count: newCount,
          commit_count: newCommitCount,
          best_val_bpb: newBest,
        };
      }),
    })),

  updateSessionStatus: (sessionId, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status } : s
      ),
    })),
}));
