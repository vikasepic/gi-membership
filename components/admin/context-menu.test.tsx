// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ContextMenu, type MenuState } from "@/components/admin/context-menu";

/**
 * The menu shipped opening correctly and doing nothing.
 *
 * Its close-on-click listener ran in the CAPTURE phase, so a click anywhere —
 * including on one of its own items — unmounted it before the item's handler
 * could run. Every entry looked live and was inert, which is worse than a menu
 * that never appeared, because you try each item twice before believing it.
 *
 * Rendering the markup would not have caught it. Only a real click does.
 */
let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const root = mounted;
  mounted = null;
  if (root) act(() => root.unmount());
  document.body.innerHTML = "";
});

/**
 * A host that actually unmounts the menu when it closes.
 *
 * This matters more than it looks. The first version of this test passed a
 * no-op onClose, so the menu never went away — and the bug, which is the
 * closing itself racing the click, could not happen. It passed against the
 * broken code. A harness that cannot reproduce the failure is not a test.
 */
function Host({ items, onClose }: { items: MenuState; onClose?: () => void }) {
  const [state, setState] = useState<MenuState>(items);
  return (
    <ContextMenu
      state={state}
      onClose={() => {
        setState(null);
        onClose?.();
      }}
    />
  );
}

function open(items: MenuState, onClose?: () => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  act(() => root.render(<Host items={items} onClose={onClose} />));
  return host;
}

const at = (items: { label: string; onSelect: () => void; disabled?: string }[]) => ({
  x: 10,
  y: 10,
  items,
});

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const itemNamed = (label: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.trim() === label)!;

describe("clicking a context menu item", () => {
  it("runs the thing it says it will", () => {
    const onSelect = vi.fn();
    open(at([{ label: "Copy", onSelect }]));
    click(itemNamed("Copy"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("runs the right one when there are several", () => {
    const copy = vi.fn();
    const del = vi.fn();
    open(at([{ label: "Copy", onSelect: copy }, { label: "Delete", onSelect: del }]));
    click(itemNamed("Delete"));
    expect(del).toHaveBeenCalledTimes(1);
    expect(copy).not.toHaveBeenCalled();
  });

  it("does nothing for an item that says why it cannot", () => {
    const onSelect = vi.fn();
    open(at([{ label: "Paste", onSelect, disabled: "Nothing copied yet" }]));
    click(itemNamed("Paste"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("still closes when the click lands outside it", () => {
    // The capture listener is right for this case — a click on something that
    // stops propagation has to close the menu too. It just must not eat the
    // menu's own clicks.
    const onClose = vi.fn();
    open(at([{ label: "Copy", onSelect: () => {} }]), onClose);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    click(outside);
    expect(onClose).toHaveBeenCalled();
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
  });

  it("renders nothing at all when closed", () => {
    open(null);
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
  });
});
