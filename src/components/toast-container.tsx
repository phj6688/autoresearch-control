"use client";

import { useEffect } from "react";
import { useChatStore, type Toast } from "@/stores/chat-store";
import { useSessionStore } from "@/stores/session-store";

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleClick = () => {
    const { selectSession } = useSessionStore.getState();
    const { setView } = useSessionStore.getState();
    selectSession(toast.sessionId);
    setView("dashboard");
    onDismiss();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-72 rounded-lg border px-3 py-2 text-left text-xs shadow-lg transition-opacity"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-accent)",
        color: "var(--color-text-primary)",
      }}
    >
      <div className="font-semibold" style={{ color: "var(--color-accent)" }}>
        {toast.sessionTag}
      </div>
      <div className="mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
        {toast.message}
      </div>
    </button>
  );
}

export function ToastContainer() {
  const toasts = useChatStore((s) => s.toasts);
  const removeToast = useChatStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-14 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={() => removeToast(t.id)}
        />
      ))}
    </div>
  );
}
