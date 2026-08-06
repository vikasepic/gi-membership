"use client";

import { BLOCK_ICON, BLOCK_LABEL } from "@/lib/block-controls";
import { blockRendersNothing, styleFor, type Block, type Device } from "@/lib/blocks";

/**
 * The whole page as a tree.
 *
 * The canvas can only be clicked where something is drawn, which fails exactly
 * where help is needed: a block hidden at the width being edited has no target
 * at all, an empty one renders nothing to aim at, and two nested columns look
 * identical to one. All three are unmistakable in a list.
 *
 * Read-only on purpose for now. Selecting from here and dragging on the canvas
 * are two ways of saying the same thing, and one of them already works.
 */

function hiddenAt(block: Block, device: Device): boolean {
  const s = styleFor(block, device);
  return device === "mobile" ? s.hideMobile : device === "tablet" ? s.hideTablet : s.hideDesktop;
}

export function BlockTree({
  blocks,
  selectedId,
  device,
  onSelect,
}: {
  blocks: Block[];
  selectedId: string | null;
  device: Device;
  onSelect: (id: string) => void;
}) {
  if (blocks.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted">Nothing on the page yet.</p>;
  }
  return (
    <ul className="flex flex-col">
      {blocks.map((b) => (
        <Row key={b.id} block={b} depth={0} selectedId={selectedId} device={device} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function Row({
  block,
  depth,
  selectedId,
  device,
  onSelect,
}: {
  block: Block;
  depth: number;
  selectedId: string | null;
  device: Device;
  onSelect: (id: string) => void;
}) {
  const selected = selectedId === block.id;
  const hidden = hiddenAt(block, device);
  const empty = blockRendersNothing(block);
  const columns = block.columns ?? [];

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(block.id)}
        style={{ paddingLeft: 10 + depth * 16 }}
        className={`flex w-full items-center gap-2 border-b border-border py-1.5 pr-2 text-left text-xs ${
          selected ? "bg-primary/12 text-primary" : "text-fg hover:bg-surface-2"
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-current opacity-60">
          <path d={BLOCK_ICON[block.type]} />
        </svg>
        <span className="truncate">
          {BLOCK_LABEL[block.type]}
          {columns.length > 0 && <span className="text-muted"> · {columns.length}</span>}
        </span>

        {/* Hidden at the width being edited. That state exists today with
            nothing to show it, so a block hidden on mobile months ago is
            invisible in both senses of the word. */}
        {hidden && (
          <span className="ml-auto shrink-0 text-[0.6rem] text-muted" title={`Hidden on ${device}`}>
            hidden
          </span>
        )}
        {/* Renders nothing because it has nothing in it — the failure that
            looks like no failure at all. */}
        {!hidden && empty && (
          <span
            className="ml-auto shrink-0 text-[0.6rem] text-primary"
            title="Empty — it will not show on the page"
          >
            empty
          </span>
        )}
      </button>

      {columns.map((col, i) => (
        <ul key={i} className="flex flex-col">
          {col.length === 0 ? (
            <li
              style={{ paddingLeft: 10 + (depth + 1) * 16 }}
              className="border-b border-border py-1.5 text-[0.66rem] text-muted"
            >
              Column {i + 1} — empty
            </li>
          ) : (
            col.map((child) => (
              <Row
                key={child.id}
                block={child}
                depth={depth + 1}
                selectedId={selectedId}
                device={device}
                onSelect={onSelect}
              />
            ))
          )}
        </ul>
      ))}
    </li>
  );
}
