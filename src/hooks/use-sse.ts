"use client";

import { useEffect, useRef } from "react";
import { useSessionStore } from "@/stores/session-store";
import { useEventsStore } from "@/stores/events-store";
import { useChatStore } from "@/stores/chat-store";
import { apiUrl } from "@/lib/base-path";
import type { Session, GpuInfo, Experiment, SessionStatus, SessionEvent } from "@/lib/types";

async function fetchInitialData(
  setSessions: (s: Session[]) => void,
  setGpus: (g: GpuInfo[]) => void
): Promise<void> {
  try {
    const [sessionsRes, gpusRes] = await Promise.all([
      fetch(apiUrl("/api/sessions")),
      fetch(apiUrl("/api/gpus")),
    ]);
    if (sessionsRes.ok) {
      const sessions = (await sessionsRes.json()) as Session[];
      setSessions(sessions);
    }
    if (gpusRes.ok) {
      const gpus = (await gpusRes.json()) as GpuInfo[];
      setGpus(gpus);
    }
  } catch {
    /* network error — will retry on reconnect */
  }
}

export function useSSE(): void {
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const store = useSessionStore.getState();
    void fetchInitialData(store.setSessions, store.setGpus);

    function connect() {
      const es = new EventSource(apiUrl("/api/stream"));
      esRef.current = es;

      es.addEventListener("open", () => {
        useSessionStore.getState().setConnected(true);
      });

      es.addEventListener("heartbeat", () => {
        /* keep-alive, no action needed */
      });

      es.addEventListener("experiment", (e) => {
        const data = JSON.parse(e.data) as {
          type: "experiment";
          sessionId: string;
          experiment: Experiment;
        };
        useSessionStore.getState().addExperiment(data.sessionId, data.experiment);
        // Toast notification for experiment completion
        const session = useSessionStore.getState().sessions.find(
          (s) => s.id === data.sessionId
        );
        const metricVal = data.experiment.val_bpb?.toFixed(2) ?? "?";
        const delta = data.experiment.delta;
        const deltaStr = delta !== null && delta !== undefined
          ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(2)})`
          : "";
        useChatStore.getState().addToast({
          sessionId: data.sessionId,
          sessionTag: session?.tag ?? data.sessionId,
          message: `Exp #${data.experiment.run_number} — ${metricVal}${deltaStr}`,
        });
      });

      es.addEventListener("session-status", (e) => {
        const data = JSON.parse(e.data) as {
          type: "session-status";
          sessionId: string;
          status: SessionStatus;
        };
        useSessionStore
          .getState()
          .updateSessionStatus(data.sessionId, data.status);
      });

      es.addEventListener("gpu-update", (e) => {
        const data = JSON.parse(e.data) as {
          type: "gpu-update";
          gpus: GpuInfo[];
        };
        useSessionStore.getState().setGpus(data.gpus);
      });

      es.addEventListener("health-event", (e) => {
        const data = JSON.parse(e.data) as { type: "health-event"; event: SessionEvent };
        useEventsStore.getState().prependEvent(data.event);
        // Also re-fetch sessions since health events may change session status
        void fetchInitialData(
          useSessionStore.getState().setSessions,
          useSessionStore.getState().setGpus
        );
      });

      es.addEventListener("error", () => {
        useSessionStore.getState().setConnected(false);
        es.close();
        esRef.current = null;
        retryRef.current = setTimeout(() => {
          const s = useSessionStore.getState();
          void fetchInitialData(s.setSessions, s.setGpus).then(connect);
        }, 3000);
      });
    }

    connect();

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };
  }, []);
}
