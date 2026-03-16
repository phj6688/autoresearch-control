"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/stores/session-store";
import { apiUrl } from "@/lib/base-path";
import type { GpuInfo } from "@/lib/types";

export function useGpuPoll(): void {
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl("/api/gpus"));
        if (res.ok) {
          const gpus = (await res.json()) as GpuInfo[];
          useSessionStore.getState().setGpus(gpus);
        }
      } catch {
        /* network error — will retry next interval */
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);
}
