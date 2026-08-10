"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Right-click, get the things you can do to this.
 *
 * A portal, positioned at the cursor: the menu would otherwise be clipped by
 * the editor's own scrolling panes, and a menu you can only see half of is
 * worse than no menu.
 *
 * It closes on anything that means "I have moved on" — another click, Escape,
 * a scroll, a resize. Scroll matters most: the menu is placed at fixed
 * coordinates, so a page that moves underneath it leaves it pointing at
 * whatever is now in that spot.
 */

export type MenuItem = {
  label: string;
  onSelect: () => void;
  /** Shown greyed with a reason rather than hidden, when there is one. */
  disabled?: string;
  /** Sets it apart, for deletes. */
  danger?: boolean;
};

export type MenuState = { x: number; y: number; items: MenuItem[] } | null;

/** Open a menu at the event's position, and stop the browser's own. */
export function menuAt(e: React.MouseEvent, items: MenuItem[]): MenuState {
  e.preventDefault();
  e.stopPropagation();
  return { x: e.clientX, y: e.clientY, items };
}

export function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!state) return;
    const close = () => onClose();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Capture, so a click on something that stops propagation still closes it.
    window.addEventListener("click", close, true);
    window.addEventListener("contextmenu", close, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("click", close, true);
      window.removeEventListener("contextmenu", close, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", key);
    };
  }, [state, onClose]);

  if (!state || !mounted) return null;

  // Kept on screen: a menu opened near the right edge would otherwise run off
  // it, and the item you wanted is the one you cannot reach.
  const WIDTH = 208;
  const height = state.items.length * 32 + 8;
  const x = Math.min(state.x, window.innerWidth - WIDTH - 8);
  const y = Math.min(state.y, window.innerHeight - height - 8);

  return createPortal(
    <div
      role="menu"
      style={{ left: Math.max(8, x), top: Math.max(8, y), width: WIDTH }}
      className="fixed z-[100] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,.45)]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={!!item.disabled}
          title={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
          className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors ${
            item.disabled
              ? "cursor-not-allowed text-muted/50"
              : item.danger
                ? "text-primary hover:bg-primary/10"
                : "text-fg hover:bg-surface-2"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
