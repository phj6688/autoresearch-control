import { create } from "zustand";
import type { SessionEvent } from "@/lib/types";

const MAX_EVENTS = 200;

interface EventsStore {
  events: SessionEvent[];
  loading: boolean;
  total: number;
  setEvents: (events: SessionEvent[], total: number) => void;
  prependEvent: (event: SessionEvent) => void;
  setLoading: (loading: boolean) => void;
}

export const useEventsStore = create<EventsStore>((set) => ({
  events: [],
  loading: false,
  total: 0,

  setEvents: (events, total) => set({ events, total }),

  prependEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_EVENTS),
      total: state.total + 1,
    })),

  setLoading: (loading) => set({ loading }),
}));
