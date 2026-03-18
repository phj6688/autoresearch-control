import { create } from "zustand";

export interface Toast {
  id: string;
  sessionId: string;
  sessionTag: string;
  message: string;
  createdAt: number;
}

interface ChatState {
  drawerOpen: boolean;
  activeConversationId: string | null;
  toasts: Toast[];

  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setActiveConversation: (id: string | null) => void;
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  drawerOpen: false,
  activeConversationId: null,
  toasts: [],

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
}));
