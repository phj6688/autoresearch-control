"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { KebabIcon } from "./icons";

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onAction: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  ariaLabel: string;
}

export function ContextMenu({ items, ariaLabel }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const enabledItems = items.filter((item) => !item.disabled);

  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const visibleItems = items.filter((item) => !item.disabled);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          // Find next enabled item
          let next = focusedIndex + 1;
          while (next < items.length && items[next].disabled) next++;
          if (next < items.length) setFocusedIndex(next);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          let prev = focusedIndex - 1;
          while (prev >= 0 && items[prev].disabled) prev--;
          if (prev >= 0) setFocusedIndex(prev);
          break;
        }
        case "Home":
          e.preventDefault();
          if (visibleItems.length > 0) {
            setFocusedIndex(items.indexOf(visibleItems[0]));
          }
          break;
        case "End":
          e.preventDefault();
          if (visibleItems.length > 0) {
            setFocusedIndex(items.indexOf(visibleItems[visibleItems.length - 1]));
          }
          break;
        case "Enter":
        case " ": {
          e.preventDefault();
          const item = items[focusedIndex];
          if (item && !item.disabled) {
            item.onAction();
            close();
          }
          break;
        }
        case "Tab":
          e.preventDefault();
          close();
          break;
        default:
          break;
      }
    },
    [items, focusedIndex, close]
  );

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (open) {
        close();
      } else {
        setOpen(true);
        // Focus first enabled item
        const firstEnabled = items.findIndex((item) => !item.disabled);
        setFocusedIndex(firstEnabled >= 0 ? firstEnabled : 0);
      }
    },
    [open, close, items]
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="shrink-0 rounded p-1 transition-colors hover:bg-[var(--color-border)]"
        style={{ color: "var(--color-text-muted)" }}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            handleToggle(e as unknown as React.MouseEvent);
          }
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
            const firstEnabled = items.findIndex((item) => !item.disabled);
            setFocusedIndex(firstEnabled >= 0 ? firstEnabled : 0);
          }
        }}
      >
        <KebabIcon size={14} />
      </button>

      {open && (
        <div
          role="menu"
          tabIndex={-1}
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded border py-1 shadow-lg"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border)",
          }}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              role="menuitem"
              tabIndex={focusedIndex === index ? 0 : -1}
              ref={(el) => {
                if (focusedIndex === index && el) el.focus();
              }}
              disabled={item.disabled}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors"
              style={{
                color: item.disabled
                  ? "var(--color-text-muted)"
                  : item.danger
                    ? "var(--color-error)"
                    : "var(--color-text-primary)",
                opacity: item.disabled ? 0.5 : 1,
                cursor: item.disabled ? "default" : "pointer",
                backgroundColor:
                  focusedIndex === index && !item.disabled
                    ? "rgba(255, 255, 255, 0.05)"
                    : "transparent",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!item.disabled) {
                  item.onAction();
                  close();
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
