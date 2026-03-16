"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiUrl } from "@/lib/base-path";
import type { ActivitySnapshot, SessionStatus } from "@/lib/types";

const POLL_INTERVAL = 3000;

export function useActivityPoll(
  sessionId: string | null,
  sessionStatus: SessionStatus | null
): { activity: ActivitySnapshot | null; error: string | null } {
  const [activity, setActivity] = useState<ActivitySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/activity`));
      if (res.ok) {
        const data = (await res.json()) as ActivitySnapshot;
        setActivity(data);
        setError(null);
      } else if (res.status === 404) {
        setError("No live process attached");
        setActivity(null);
      } else {
        setError("Failed to fetch activity");
      }
    } catch {
      setError("Network error");
    }
  }, [sessionId]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!sessionId || (sessionStatus !== "running" && sessionStatus !== "paused")) {
      setActivity(null);
      setError(null);
      return;
    }

    void fetchActivity();

    if (sessionStatus === "running") {
      intervalRef.current = setInterval(() => {
        void fetchActivity();
      }, POLL_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, sessionStatus, fetchActivity]);

  return { activity, error };
}
