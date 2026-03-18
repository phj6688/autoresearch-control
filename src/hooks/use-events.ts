"use client";

import { useEffect, useCallback } from "react";
import { useEventsStore } from "@/stores/events-store";
import { apiUrl } from "@/lib/base-path";
import type { SessionEvent } from "@/lib/types";

interface UseEventsFilters {
  session_id?: string;
  type?: string;
}

interface UseEventsReturn {
  events: SessionEvent[];
  loading: boolean;
  total: number;
  refresh: () => void;
}

export function useEvents(filters?: UseEventsFilters): UseEventsReturn {
  const events = useEventsStore((s) => s.events);
  const loading = useEventsStore((s) => s.loading);
  const total = useEventsStore((s) => s.total);

  const fetchEvents = useCallback(async () => {
    useEventsStore.getState().setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.session_id) {
        params.set("session_id", filters.session_id);
      }
      if (filters?.type) {
        params.set("type", filters.type);
      }
      const query = params.toString();
      const url = apiUrl(`/api/events${query ? `?${query}` : ""}`);
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          events: SessionEvent[];
          total: number;
        };
        useEventsStore.getState().setEvents(data.events, data.total);
      }
    } catch {
      /* network error — will retry on next refresh */
    } finally {
      useEventsStore.getState().setLoading(false);
    }
  }, [filters?.session_id, filters?.type]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const refresh = useCallback(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return { events, loading, total, refresh };
}
