"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function getResolvedTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

function applyTheme(theme: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

const listeners = new Set<() => void>();
let currentPreference: ThemePreference = "system";

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function getSnapshot(): ThemePreference {
  return currentPreference;
}

function getServerSnapshot(): ThemePreference {
  return "system";
}

function setPreference(pref: ThemePreference): void {
  currentPreference = pref;
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(getResolvedTheme(pref));
  for (const cb of listeners) cb();
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const resolved = typeof window === "undefined" ? "dark" : getResolvedTheme(preference);

  useEffect(() => {
    currentPreference = getStoredPreference();
    applyTheme(getResolvedTheme(currentPreference));
    for (const cb of listeners) cb();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (currentPreference === "system") {
        applyTheme(getResolvedTheme("system"));
        for (const cb of listeners) cb();
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const cycle = useCallback(() => {
    const order: ThemePreference[] = ["dark", "light", "system"];
    const idx = order.indexOf(currentPreference);
    setPreference(order[(idx + 1) % order.length]);
  }, []);

  return { preference, resolved, cycle } as const;
}
