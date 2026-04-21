import { create } from "zustand";

export interface Toast {
  id: string;
  sessionId: string;
  sessionTag: string;
  message: string;
  createdAt: number;
}

export interface SuggestedSessionConfig {
  tag?: string;
  agent_type?: string;
  strategy?: string;
  metric_name?: string;
  metric_direction?: "higher" | "lower";
  gpu?: string;
}

interface ChatState {
  drawerOpen: boolean;
  activeConversationId: string | null;
  toasts: Toast[];
  suggestedConfig: SuggestedSessionConfig | null;

  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setActiveConversation: (id: string | null) => void;
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => void;
  removeToast: (id: string) => void;
  applySuggestion: (config: SuggestedSessionConfig) => void;
  clearSuggestion: () => void;
}

let toastCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  drawerOpen: false,
  activeConversationId: null,
  toasts: [],
  suggestedConfig: null,

  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  setActiveConversation: (id) => set({ activeConversationId: id }),

  addToast: (toast) =>
    set((s) => {
      const id = `toast-${++toastCounter}`;
      const newToast = { ...toast, id, createdAt: Date.now() };
      // Max 3 toasts, FIFO
      const toasts = [...s.toasts, newToast].slice(-3);
      return { toasts };
    }),

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  applySuggestion: (config) => set({ suggestedConfig: config }),
  clearSuggestion: () => set({ suggestedConfig: null }),
}));
