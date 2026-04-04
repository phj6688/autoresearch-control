"use client";

import { useTheme } from "@/hooks/use-theme";
import { SunIcon, MoonIcon, MonitorIcon } from "./icons";

export function ThemeToggle() {
  const { preference, cycle } = useTheme();

  const label =
    preference === "light"
      ? "Switch to system theme"
      : preference === "dark"
        ? "Switch to light theme"
        : "Switch to dark theme";

  const Icon =
    preference === "light"
      ? SunIcon
      : preference === "dark"
        ? MoonIcon
        : MonitorIcon;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="flex items-center justify-center rounded p-1.5 transition-colors"
      style={{
        color: "var(--color-text-secondary)",
        backgroundColor: "transparent",
      }}
    >
      <Icon size={16} />
    </button>
  );
}
