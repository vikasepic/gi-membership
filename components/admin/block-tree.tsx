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
 * Selecting from here is not a duplicate of the canvas either. A column can
 * only be clicked on the canvas where nothing is drawn on top of it, so a
 * column with blocks in it has no target at all and its own background,
 * padding and corner are unreachable. This tree is the only way in.
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
  onSelectSection,
  onContext,
}: {
  blocks: Block[];
  selectedId: string | null;
  device: Device;
  onSelect: (id: string) => void;
  /** Right-click a row for the same menu the canvas gives. */
  onContext?: (e: React.MouseEvent, block: Block) => void;
  /** Deselect, which is how the band's own settings are reached. */
  onSelectSection?: () => void;
}) {
  return (
    <ul className="flex flex-col">
      {/* The band everything stands on. Its settings are what the panel shows
          when nothing is selected — which is unreachable from a tree of blocks
          unless the tree says so. */}
      {onSelectSection && (
        <li>
          <button
            type="button"
            onClick={onSelectSection}
            className={`flex w-full items-center gap-2 border-b border-border px-2.5 py-1.5 text-left text-xs ${
              selectedId === null ? "bg-primary/12 text-primary" : "text-fg hover:bg-surface-2"
            }`}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-current opacity-60">
              <path d="M3 5h18v14H3V5Zm2 2v10h14V7H5Z" />
            </svg>
            <span>Section</span>
            <span className="ml-auto text-[0.6rem] text-muted">band, colour, visibility</span>
          </button>
        </li>
      )}

      {blocks.length === 0 && (
        <li className="px-3 py-2 text-xs text-muted">Nothing in this section yet.</li>
      )}
      {blocks.map((b) => (
        <Row
          key={b.id}
          block={b}
          depth={0}
          selectedId={selectedId}
          device={device}
          onSelect={onSelect}
          onContext={onContext}
        />
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
  onContext,
}: {
  block: Block;
  depth: number;
  selectedId: string | null;
  device: Device;
  onSelect: (id: string) => void;
  onContext?: (e: React.MouseEvent, block: Block) => void;
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
        onContextMenu={(e) => {
          onSelect(block.id);
          onContext?.(e, block);
        }}
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

      {columns.map((col, i) => {
        // The same id the canvas builds, so both ways of selecting a column
        // land on the same thing.
        const colId = `${block.id}#${i}`;
        return (
          <ul key={i} className="flex flex-col">
            <li>
              <button
                type="button"
                onClick={() => onSelect(colId)}
                style={{ paddingLeft: 10 + (depth + 1) * 16 }}
                className={`flex w-full items-center gap-2 border-b border-border py-1.5 pr-2 text-left text-[0.66rem] ${
                  selectedId === colId ? "bg-primary/12 text-primary" : "text-muted hover:bg-surface-2"
                }`}
              >
                {/* One string, not a span: split text nodes read as
                    "Column 1" plus a comment to anyone reading the markup. */}
                {`Column ${i + 1}${col.length === 0 ? " — empty" : ""}`}
              </button>
            </li>
            {col.map((child) => (
              <Row
                key={child.id}
                block={child}
                depth={depth + 2}
                selectedId={selectedId}
                device={device}
                onSelect={onSelect}
                onContext={onContext}
              />
            ))}
          </ul>
        );
      })}
    </li>
  );
}
