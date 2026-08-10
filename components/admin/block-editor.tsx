"use client";

import { MediaButton } from "@/components/admin/media-modal";
import { copyToClipboard, readClipboard, onClipboardChange, type Clip } from "@/lib/clipboard";
import { ContextMenu, menuAt, type MenuState } from "@/components/admin/context-menu";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlockBody } from "@/components/page/blocks";
import { RichText } from "@/components/editor/rich-text";
import {
  BLOCK_LABEL,
  BLOCK_ICON,
  COLUMN_CONTROLS,
  groupedPalette,
  clearControl,
  controlsFor,
  deviceOf,
  isGroup,
  readControl,
  scopeOf,
  writeControl,
  asSegment,
  sections,
  SEGMENT_ICONS,
  type Control,
} from "@/lib/block-controls";
import {
  addTarget,
  blockRendersNothing,
  duplicateBlock,
  reid,
  edgeIndex,
  findBlock,
  normalizeBlocks,
  insertBlock,
  moveBlock,
  newBlock,
  removeBlock,
  updateBlock,
  evenWidths,
  hasOverride,
  normalizeBackground,
  columnAsBlock,
  setColumnStyle,
  splitColumnId,
  setColumnWidth,
  DEVICE_CANVAS,
  type Block,
  type BlockType,
  type Device,
  type DropTarget,
} from "@/lib/blocks";
import { DeviceSwitch } from "@/components/admin/device-switch";
import { BlockTree } from "@/components/admin/block-tree";
import { PositionPicker } from "@/components/admin/position-picker";
import { SectionSettings, type SectionEdit } from "@/components/admin/section-settings";
import { emptyHistory, record, redo, undo, undoIntent, type History } from "@/lib/undo";

/**
 * The width being edited, for the canvas.
 *
 * Context rather than a prop: it would otherwise be threaded through Zone,
 * CanvasBlock, RowColumns and Editable, none of which have any use for it
 * except to hand it on.
 */
const CanvasDevice = createContext<Device>("desktop");
import { backgroundCss, blockCssAt, columnCss, effectiveWidths, mobilePaddingNotice, rowLayout, stacksAt } from "@/lib/block-style";
import { imageSrc } from "@/lib/page-sections";
import type { BandTheme } from "@/lib/page-sections";

// The builder.
//
// Full screen on purpose: a canvas, a palette and an inspector do not fit
// beside the section list, and cramming them there is what made the first
// version feel like a form rather than a builder.
//
// The canvas renders BlockBody — the same component the live page uses — so
// what is on screen here is what a buyer gets. Only the chrome around each
// block belongs to the editor.

type Tab = "content" | "style" | "advanced";
type DragPayload =
  | { kind: "new"; type: BlockType; props?: Record<string, unknown> }
  | { kind: "move"; id: string };

const input =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-fg";

/** Uploads a file and returns the stored path, or an error. */

export function BlockEditor({
  blocks,
  theme,
  title,
  section,
  onChange,
  onClose,
}: {
  blocks: Block[];
  theme: BandTheme;
  title: string;
  /**
   * The band this content stands on.
   *
   * Optional so the editor still renders anywhere it is used without one, but
   * the page builder always passes it: changing a band colour used to mean
   * closing the editor to reach the form behind it, which is closing the only
   * thing you were judging the colour against.
   */
  section?: SectionEdit;
  onChange: (next: Block[]) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  // Which width is being edited. One piece of state for both halves: the canvas
  // narrows and the inspector writes to the same device, because a panel that
  // edits mobile while the canvas shows desktop is a panel you cannot trust.
  const [device, setDevice] = useState<Device>("desktop");
  const drag = useRef<DragPayload | null>(null);
  const [search, setSearch] = useState("");
  const [left, setLeft] = useState<"add" | "structure">("add");
  // Reset whenever the selection changes, so a pending "Delete it" never lands
  // on a block someone has since moved to.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Drawn with the same function the live band uses, so the canvas cannot show
  // one thing and the page another.
  const sectionBackdrop = useMemo(() => {
    const bg = section?.background;
    return bg && bg.type !== "none" ? backgroundCss(normalizeBackground(bg), theme) : undefined;
  }, [section?.background, theme]);
  // Disarmed whenever the selection moves, from any of the several places it
  // can move from — the canvas, the tree, a drop. One effect covers them all;
  // a reset in each handler covers whichever ones somebody remembered.
  useEffect(() => setConfirmDelete(false), [selectedId]);

  /**
   * The families this site has, for the Font select.
   *
   * Fetched once when the builder opens rather than threaded down from the
   * page: this is one small list, several components above, and a builder that
   * opened before the fetch lands simply shows "Page default" until it does.
   */
  /**
   * What is on the clipboard, so the paste control can name it.
   *
   * Watched rather than read once: a block copied in another tab — the other
   * product's editor, which is the whole point — has to become pasteable here
   * without a reload.
   */
  const [clip, setClip] = useState<Clip | null>(null);
  useEffect(() => {
    const sync = () => setClip(readClipboard());
    sync();
    return onClipboardChange(sync);
  }, []);

  const [menu, setMenu] = useState<MenuState>(null);

  /**
   * Everything you can do to a block, at the cursor.
   *
   * The same four things the toolbar offers. A menu that is a subset of the
   * buttons beside it is a menu people stop opening; one that matches is one
   * they can rely on.
   */
  const blockMenu = (e: React.MouseEvent, block: Block) => {
    const pasteAfter = () => {
      if (clip?.kind !== "block") return;
      const found = findBlock(blocks, block.id);
      if (!found) return;
      const copy = reid(normalizeBlocks([clip.data])[0]);
      if (!copy) return;
      const target =
        found.parentId === null
          ? ({ zone: "root", index: found.index + 1 } as const)
          : ({
              zone: "column",
              rowId: found.parentId,
              column: found.column ?? 0,
              index: found.index + 1,
            } as const);
      commit(insertBlock(blocks, copy, target));
      setSelectedId(copy.id);
    };

    setMenu(
      menuAt(e, [
        {
          label: "Copy",
          onSelect: () =>
            copyToClipboard({
              kind: "block",
              label: BLOCK_LABEL[block.type] ?? block.type,
              data: block,
            }),
        },
        {
          label: clip?.kind === "block" ? `Paste ${clip.label} after` : "Paste",
          onSelect: pasteAfter,
          disabled: clip?.kind === "block" ? undefined : "Nothing copied yet",
        },
        { label: "Duplicate", onSelect: () => commit(duplicateBlock(blocks, block.id)) },
        {
          label: "Delete",
          danger: true,
          onSelect: () => {
            commit(removeBlock(blocks, block.id));
            setSelectedId(null);
          },
        },
      ]),
    );
  };

  const [families, setFamilies] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void fetch("/api/fonts")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { families?: string[] } | null) => {
        if (alive && j?.families) setFamilies(j.families);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // What is being dragged, in words. The tile that follows the cursor needs it,
  // and so does the gap that opens where it will land.
  const [dragging, setDragging] = useState<{ label: string | null; type: BlockType | null }>({
    label: null,
    type: null,
  });
  const [dropAt, setDropAt] = useState<string | null>(null);
  const [history, setHistory] = useState<History<Block[]>>(() => emptyHistory<Block[]>());

  /**
   * Every change to the tree goes through here.
   *
   * `key` is what caused it, so a run of the same thing — dragging one slider,
   * typing into one heading — collapses into a single step. Structural changes
   * pass no key and always stand alone.
   */
  function commit(next: Block[], key: string | null = null) {
    setHistory((h) => record(h, blocks, key, Date.now()));
    onChange(next);
  }

  function stepBack() {
    const step = undo(history, blocks);
    if (!step) return;
    setHistory(step.history);
    onChange(step.value);
  }

  function stepForward() {
    const step = redo(history, blocks);
    if (!step) return;
    setHistory(step.history);
    onChange(step.value);
  }

  /**
   * A selected column, if that is what is selected.
   *
   * Its id is "rowId#2". Resolved before the block lookup, because findBlock
   * would search for that id and find nothing — a column is not a block and
   * has no id of its own.
   */
  const column = useMemo(() => {
    const parts = selectedId ? splitColumnId(selectedId) : null;
    if (!parts) return null;
    const row = findBlock(blocks, parts.rowId)?.block;
    if (!row?.columns || parts.index >= row.columns.length) return null;
    return { row, index: parts.index };
  }, [blocks, selectedId]);

  const selected = useMemo(
    () =>
      column
        ? // The column's style, wearing a block so every existing control can
          // read and write it without knowing what it is.
          columnAsBlock(column.row, column.index)
        : selectedId
          ? (findBlock(blocks, selectedId)?.block ?? null)
          : null,
    [blocks, selectedId, column],
  );

  function patch(id: string, next: Block, key?: string) {
    commit(updateBlock(blocks, id, () => next), key ?? `edit:${id}`);
  }

  function drop(target: DropTarget) {
    const payload = drag.current;
    drag.current = null;
    setDropAt(null);
    if (!payload) return;
    if (payload.kind === "new") {
      const base = newBlock(payload.type);
      const block = payload.props ? { ...base, props: { ...base.props, ...payload.props } } : base;
      // insertBlock refuses a row inside a column; say so rather than letting
      // the click appear to do nothing.
      if (block.type === "row" && target.zone === "column") return;
      commit(insertBlock(blocks, block, target));
      setSelectedId(block.id);
      setTab("content");
    } else {
      commit(moveBlock(blocks, payload.id, target));
    }
  }

  function add(type: BlockType, preset?: Record<string, unknown>) {
    // Merged over the type's own defaults rather than replacing them — a
    // preset says what is different about this way of adding it, not
    // everything the block needs.
    const base = newBlock(type);
    const block = preset ? { ...base, props: { ...base.props, ...preset } } : base;
    commit(insertBlock(blocks, block, addTarget(blocks, selectedId, type)));
    setSelectedId(block.id);
    setTab("content");
  }

  const tabs = column
    ? { content: [], style: COLUMN_CONTROLS, advanced: [] }
    : selected
      ? controlsFor(selected, families)
      : null;

  /**
   * One writer for both.
   *
   * A column's edit has to be unwrapped back onto its row; a block's is written
   * as it is. Keeping that in one place is what stops the two paths drifting.
   */
  function applyEdit(next: Block, key?: string) {
    if (column) patch(column.row.id, setColumnStyle(column.row, column.index, next.style), key);
    else if (selected) patch(selected.id, next, key);
  }

  // Escape closes it. A full-screen editor with only one way out is a trap the
  // first time a click misses. Cmd/Ctrl+Z is the other reflex — and the one
  // that decides whether dragging a block somewhere feels safe to try.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const intent = undoIntent(e);
      if (!intent) return;
      e.preventDefault();
      if (intent === "undo") stepBack();
      else stepForward();
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll under the overlay.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, history, blocks]);

  const overlay = (
    <CanvasDevice.Provider value={device}>
    <Dragging.Provider value={dragging}>
    {dragging.label && <DragTile label={dragging.label} type={dragging.type} />}
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface-2">
      {/* Rendered at the editor's root and portalled to the body: a menu
          inside a scrolling pane scrolls away from what it belongs to. */}
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <strong className="font-display text-sm">Builder</strong>
        <span className="text-sm text-muted">{title}</span>
        <DeviceSwitch device={device} onChange={setDevice} className="mx-auto" />
        <div className="flex items-center gap-0.5">
          {/* Visible as well as bound to the keyboard: a shortcut nobody knows
              about is not an undo, and the button is what tells you there is
              one. Disabled states double as "there is nothing to undo". */}
          <IconBtn label="Undo (⌘Z)" onClick={stepBack} disabled={history.past.length === 0}>
            ↶
          </IconBtn>
          <IconBtn label="Redo (⇧⌘Z)" onClick={stepForward} disabled={history.future.length === 0}>
            ↷
          </IconBtn>
        </div>
        <span className="text-xs text-muted">
          {blocks.length === 0 ? "Empty" : `${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-4 py-2 text-sm hover:border-fg"
        >
          &larr; Back to the page
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          Done
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[190px_1fr_300px]">
        {/* Palette */}
        <aside className="flex flex-col overflow-y-auto border-r border-border bg-surface">
          {/* Two ways of looking at the same page: what you can add, and what
              is already there. A tab rather than a floating window, because the
              editor is already an overlay and a window inside an overlay is a
              thing to move out of the way. */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-surface">
            {(["add", "structure"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setLeft(v)}
                className={`flex-1 px-2 py-2 text-[0.68rem] capitalize ${
                  left === v ? "border-b-2 border-primary font-medium text-fg" : "text-muted"
                }`}
              >
                {v === "add" ? "Add" : "Structure"}
              </button>
            ))}
          </div>

          {/* Rendered once, at the editor's root: a menu inside a scrolling
              pane is a menu that scrolls away from the thing it belongs to. */}
          {left === "structure" ? (
            <BlockTree
              blocks={blocks}
              selectedId={selectedId}
              device={device}
              onSelectSection={section ? () => setSelectedId(null) : undefined}
              onContext={blockMenu}
              onSelect={(id) => {
                setSelectedId(id);
                // A column has only a Style tab; landing on Content would show
                // an empty panel and read as nothing having happened.
                setTab(splitColumnId(id) ? "style" : "content");
              }}
            />
          ) : (
            <>
          <div className="sticky top-[33px] z-10 border-b border-border bg-surface p-2.5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blocks"
              aria-label="Search blocks"
              className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-primary"
            />
          </div>
          {groupedPalette(search).map((g) => (
            <div key={g.title} className="flex flex-col gap-1.5 px-2.5 pb-3 pt-2.5">
              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted">
                {g.title}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {g.items.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      drag.current = { kind: "new", type: p.type, props: p.props };
                      setDragging({ label: p.label, type: p.type });
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("text/plain", p.type);
                      // The browser's own drag image is a screenshot of the
                      // button. A tile that names what you picked up is the
                      // whole point, and it cannot be drawn over that one.
                      hideDragImage(e.dataTransfer);
                    }}
                    onDragEnd={() => {
                      drag.current = null;
                      setDragging({ label: null, type: null });
                      setDropAt(null);
                    }}
                    onClick={() => add(p.type, p.props)}
                    className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-1 py-2.5 text-[0.68rem] leading-tight transition-colors hover:border-primary hover:text-primary"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current text-muted">
                      <path d={BLOCK_ICON[p.type]} />
                    </svg>
                    <span className="text-center">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groupedPalette(search).length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">Nothing called that.</p>
          )}
            </>
          )}
        </aside>

        {/* Canvas.
            The band's own background belongs here too, or choosing a picture
            for the section changes the panel and nothing you are looking at —
            the canvas IS the band, and it was painting only its colour. */}
        <div
          className="min-w-0 overflow-y-auto p-6"
          style={{ background: theme.bg, ...sectionBackdrop }}
        >
          <div
            className="mx-auto w-full transition-[max-width] duration-200"
            style={{ maxWidth: DEVICE_CANVAS[device] ?? 900 }}
          >
            <Zone
              blocks={blocks}
              theme={theme}
              zoneId="root"
              selectedId={selectedId}
              dropAt={dropAt}
              setDropAt={setDropAt}
              onContext={blockMenu}
              onSelect={(id) => {
                setSelectedId(id);
                setTab("content");
              }}
              onDrop={drop}
              onDragEnd={() => setDragging({ label: null, type: null })}
              onDragStart={(id) => {
                drag.current = { kind: "move", id };
                const found = findBlock(blocks, id);
                const type = found?.block.type ?? null;
                setDragging({ label: type ? BLOCK_LABEL[type] : null, type });
              }}
              onPatch={patch}
              target={(index) => ({ zone: "root", index })}
            />
            {blocks.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm" style={{ color: theme.muted, borderColor: theme.rule }}>
                <span>Drag a block here, or click one on the left.</span>
                {/* Without this the only way to paste is beside an existing
                    block, and the section you most want to paste into is the
                    empty one. */}
                {clip?.kind === "block" && (
                  <button
                    type="button"
                    onClick={() => {
                      const copy = reid(normalizeBlocks([clip.data])[0]);
                      if (!copy) return;
                      commit(insertBlock(blocks, copy, { zone: "root", index: 0 }));
                      setSelectedId(copy.id);
                    }}
                    className="rounded-full border px-3 py-1.5 text-xs"
                    style={{ borderColor: theme.rule }}
                  >
                    Paste {clip.label}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Inspector */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-l border-border bg-surface">
          {!selected || !tabs ? (
            // Nothing selected is not nothing to edit — it is the band. Which is
            // also what clicking away from a block already means.
            section ? (
              <SectionSettings section={section} />
            ) : (
              <p className="p-4 text-sm text-muted">Select a block to edit it.</p>
            )
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <strong className="font-display text-sm">
                  {column ? `Column ${column.index + 1}` : BLOCK_LABEL[selected.type]}
                </strong>
                <div className="ml-auto flex gap-1">
                  {column ? (
                    // A column cannot be duplicated or deleted on its own — its
                    // count belongs to the row. Offering the buttons and having
                    // them do nothing would be worse than not offering them.
                    <button
                      type="button"
                      onClick={() => setSelectedId(column.row.id)}
                      className="rounded px-2 text-[0.68rem] text-muted hover:text-fg"
                    >
                      Edit the row
                    </button>
                  ) : (
                  <>
                  <IconBtn label="Duplicate" onClick={() => commit(duplicateBlock(blocks, selected.id))}>
                    ⧉
                  </IconBtn>
                  {/* Copy travels between pages; duplicate stays here. Both
                      exist because "another one of these, right there" and
                      "this one, on the other product" are different jobs. */}
                  <IconBtn
                    label="Copy — paste it on any page"
                    onClick={() =>
                      copyToClipboard({
                        kind: "block",
                        label: BLOCK_LABEL[selected.type] ?? selected.type,
                        data: selected,
                      })
                    }
                  >
                    ⧉+
                  </IconBtn>
                  {clip?.kind === "block" && (
                    <IconBtn
                      label={`Paste ${clip.label} after this`}
                      onClick={() => {
                        const found = findBlock(blocks, selected.id);
                        if (!found) return;
                        // Fresh ids, or the pasted block and the one it was
                        // copied from answer to the same id and selecting
                        // either selects the first.
                        const copy = reid(normalizeBlocks([clip.data])[0]);
                        if (!copy) return;
                        const target =
                          found.parentId === null
                            ? ({ zone: "root", index: found.index + 1 } as const)
                            : ({
                                zone: "column",
                                rowId: found.parentId,
                                column: found.column ?? 0,
                                index: found.index + 1,
                              } as const);
                        commit(insertBlock(blocks, copy, target));
                        setSelectedId(copy.id);
                      }}
                    >
                      ⎘
                    </IconBtn>
                  )}
                  {/* Two clicks, like every other delete here. Undo exists,
                      but a block removed by a mis-aimed click on a 24px target
                      is one you have to notice before you can undo it. */}
                  {confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        commit(removeBlock(blocks, selected.id));
                        setSelectedId(null);
                        setConfirmDelete(false);
                      }}
                      className="rounded-md bg-primary px-2 py-1 text-[0.68rem] font-medium text-primary-fg"
                    >
                      Delete it
                    </button>
                  ) : (
                    <IconBtn label="Delete" onClick={() => setConfirmDelete(true)}>
                      {/* A bin, not a cross. Every other ✕ in this editor
                          closes something, and a delete wearing the same
                          picture is one people avoid pressing — or press by
                          mistake expecting the panel to shut. */}
                      <TrashIcon />
                    </IconBtn>
                  )}
                  </>
                  )}
                </div>
              </div>
              <div className="flex border-b border-border">
                {(column ? (["style"] as Tab[]) : (["content", "style", "advanced"] as Tab[])).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`flex-1 px-2 py-2 text-xs capitalize ${
                      tab === t ? "border-b-2 border-primary font-medium text-fg" : "text-muted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex flex-col overflow-y-auto">
                {sections(
                  tab === "content" ? tabs.content : tab === "style" ? tabs.style : tabs.advanced,
                ).map((section, si) => (
                  /* Open by default, and each remembers itself while the block
                     stays selected. A block with twenty settings was a wall;
                     this makes it a panel. */
                  <details key={section.title ?? `s${si}`} open className="insp-section border-b border-border">
                    {section.title ? (
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[0.7rem] font-semibold text-fg [&::-webkit-details-marker]:hidden">
                        <span className="text-[0.55rem] text-muted transition-transform">▶</span>
                        {section.title}
                      </summary>
                    ) : (
                      <summary className="hidden" />
                    )}
                    <div className="flex flex-col gap-2.5 px-3 pb-3 pt-1">
                {section.controls.map((c) =>
                  isGroup(c) ? null : (
                    <ControlField
                      key={`${c.kind}:${c.key}`}
                      control={c}
                      block={selected}
                      device={device}
                      // Fills the description in from the library, but only
                      // where there isn't one: the same photo can mean
                      // different things on different pages, and what someone
                      // wrote here beats what the file was called.
                      onPickAlt={(alt) => {
                        // Alt is a content control, which is the tab this is
                        // rendered from — but look across all three rather than
                        // depend on that staying true.
                        const altControl = [...tabs.content, ...tabs.style, ...tabs.advanced].find(
                          (x) => !isGroup(x) && x.key === "alt",
                        );
                        const current = String(
                          (selected.props as Record<string, unknown>).alt ?? "",
                        ).trim();
                        if (altControl && !isGroup(altControl) && !current) {
                          applyEdit(writeControl(selected, altControl, alt, device));
                        }
                      }}
                      // Keyed per control, so dragging one slider is one undo
                      // step but moving to the next control starts another.
                      onChange={(v) =>
                        applyEdit(
                          writeControl(selected, c, v, column ? "desktop" : device),
                          `set:${selected.id}:${c.key}`,
                        )
                      }
                      onClear={() => applyEdit(clearControl(selected, c, device))}
                    />
                  ),
                )}
                    </div>
                  </details>
                ))}
                {tab === "style" && tabs.style.length === 0 && (
                  <p className="p-3 text-xs text-muted">
                    Nothing to style here — spacing and background are under Advanced.
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
    </Dragging.Provider>
    </CanvasDevice.Provider>
  );

  // Portalled to the body. The editor's own panes are position: sticky, which
  // creates a stacking context — so a fixed overlay inside one is trapped in
  // it and paints underneath the admin header. There is no z-index that fixes
  // that; it has to leave the subtree.
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}

/**
 * Suppress the browser's own drag image so ours is the only one.
 *
 * A screenshot of whatever was grabbed — a palette tile, or a 20px handle — says
 * nothing about what is being moved once the cursor is elsewhere. Optional call
 * because not every DataTransfer has it, and losing a drag over a missing
 * decoration would be a poor trade.
 */
function hideDragImage(dt: DataTransfer) {
  try {
    const blank = new Image();
    blank.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    dt.setDragImage?.(blank, 0, 0);
  } catch {
    // Nothing to do — the drag still works, it just carries the default image.
  }
}

/** What is being dragged, for the tile and for the gap's label. */
const Dragging = createContext<{ label: string | null; type: BlockType | null }>({
  label: null,
  type: null,
});

/** A bin. Drawn rather than typed, so it reads as a delete at 12px. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 11.2a2 2 0 0 1-2 1.8H9a2 2 0 0 1-2-1.8L6 9Zm4 2v9h2v-9h-2Zm4 0v9h2v-9h-2Z" />
    </svg>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded px-1.5 py-0.5 text-sm text-muted enabled:hover:bg-surface-2 enabled:hover:text-fg disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** One droppable list of blocks — the canvas root, or one column of a row. */
function Zone({
  blocks,
  theme,
  zoneId,
  selectedId,
  dropAt,
  setDropAt,
  onSelect,
  onContext,
  onDrop,
  onDragStart,
  onDragEnd,
  onPatch,
  target,
  emptyLabel,
  className,
}: {
  blocks: Block[];
  theme: BandTheme;
  zoneId: string;
  selectedId: string | null;
  dropAt: string | null;
  setDropAt: (v: string | null) => void;
  onSelect: (id: string) => void;
  onContext?: (e: React.MouseEvent, block: Block) => void;
  onDrop: (t: DropTarget) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onPatch: (id: string, next: Block) => void;
  target: (index: number) => DropTarget;
  /** Shown when the zone is empty. Never a drop target of its own — see below. */
  emptyLabel?: string;
  className?: string;
}) {
  // The whole container outlines while the cursor is anywhere inside it — not
  // only over the strip at the end. This is the signal that answers "inside
  // this column, or beside it", which a gap between two blocks cannot.
  const armed = dropAt?.startsWith(`${zoneId}:`) ?? false;
  const { label: dragLabel } = useContext(Dragging);
  return (
    <div
      data-zone={zoneId}
      className={className ?? "flex min-h-[40px] flex-col"}
      style={
        armed
          ? {
              outline: "2px dashed var(--primary)",
              outlineOffset: -2,
              background: "color-mix(in srgb, var(--primary) 5%, transparent)",
              borderRadius: 8,
            }
          : undefined
      }
      onDragOver={(e) => {
        // Anything reaching here is not over a block: every block stops the
        // event itself and decides above-or-below. Testing currentTarget ===
        // target instead meant only the bare strip between blocks accepted a
        // drop, and the words "Drop here" — being a child — accepted nothing.
        e.preventDefault();
        e.stopPropagation();
        setDropAt(`${zoneId}:${blocks.length}`);
      }}
      onDrop={(e) => {
        e.preventDefault();
        // Without this the row containing this column handles the drop too,
        // and puts the block beside the row instead of inside it. The last
        // handler wins, so the block lands nowhere near where it was dropped.
        e.stopPropagation();
        onDrop(target(blocks.length));
      }}
    >
      {blocks.map((block, index) => (
        <CanvasBlock
          key={block.id}
          block={block}
          theme={theme}
          zoneId={zoneId}
          index={index}
          selectedId={selectedId}
          dropAt={dropAt}
          setDropAt={setDropAt}
          onSelect={onSelect}
          onContext={onContext}
          onDrop={onDrop}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onPatch={onPatch}
          target={target}
        />
      ))}
      {blocks.length === 0 && (
        // An empty column is invisible until something is dragged near it,
        // which is exactly when it needs to exist. pointer-events-none so the
        // words cannot become the drop target and swallow the event before the
        // zone sees it.
        <p
          className="pointer-events-none py-3 text-center text-[0.68rem]"
          style={{ opacity: armed ? 1 : 0.7, color: armed ? "var(--primary)" : undefined }}
        >
          {armed ? `Drop ${dragLabel ?? "it"} here` : emptyLabel}
        </p>
      )}
    </div>
  );
}

function CanvasBlock({
  block,
  theme,
  zoneId,
  index,
  selectedId,
  dropAt,
  setDropAt,
  onSelect,
  onContext,
  onDrop,
  onDragStart,
  onDragEnd,
  onPatch,
  target,
}: {
  block: Block;
  theme: BandTheme;
  zoneId: string;
  index: number;
  selectedId: string | null;
  dropAt: string | null;
  setDropAt: (v: string | null) => void;
  onSelect: (id: string) => void;
  onContext?: (e: React.MouseEvent, block: Block) => void;
  onDrop: (t: DropTarget) => void;
  onDragStart: (id: string) => void;
  onPatch: (id: string, next: Block) => void;
  onDragEnd: () => void;
  target: (index: number) => DropTarget;
}) {
  const device = useContext(CanvasDevice);
  const { label: dragLabel } = useContext(Dragging);
  const selected = selectedId === block.id;
  const empty = blockRendersNothing(block);

  /** Above or below, decided by which half of the block the cursor is in. */
  function edge(e: React.DragEvent<HTMLDivElement>): number {
    const r = e.currentTarget.getBoundingClientRect();
    return edgeIndex(e.clientY, r.top, r.height, index);
  }

  return (
    <div
      data-block={block.id}
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropAt(`${zoneId}:${edge(e)}`);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(target(edge(e)));
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
      onContextMenu={(e) => {
        // Select first: every item on the menu acts on the selection, and
        // right-clicking a block you have not selected should still act on
        // the one under the cursor.
        onSelect(block.id);
        onContext?.(e, block);
      }}
    >
      {dropAt === `${zoneId}:${index}` && <DropLine label={dragLabel} />}

      <div
        className={`relative rounded-sm ${selected ? "outline outline-2 outline-offset-2 outline-[var(--primary)]" : "hover:outline hover:outline-1 hover:outline-offset-2 hover:outline-[var(--border)]"}`}
      >
        {/* Dragging by a handle, not the body: a slider or a button inside the
            block would otherwise swallow the gesture. */}
        <span
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            onDragStart(block.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", block.id);
            // The browser would otherwise drag a screenshot of this 20px chip.
            hideDragImage(e.dataTransfer);
          }}
          onDragEnd={() => {
            setDropAt(null);
            onDragEnd();
          }}
          title={`Move ${BLOCK_LABEL[block.type]}`}
          className={`absolute -left-2 -top-2 z-10 cursor-grab rounded bg-primary px-1.5 text-[0.6rem] leading-4 text-primary-fg ${
            selected ? "" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          ⠿ {BLOCK_LABEL[block.type]}
        </span>

        <div style={blockCssAt(block, theme, device)}>
          {block.type === "row" ? (
            <RowColumns
              block={block}
              theme={theme}
              selectedId={selectedId}
              dropAt={dropAt}
              setDropAt={setDropAt}
              onSelect={onSelect}
              onDrop={onDrop}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onPatch={onPatch}
            />
          ) : empty ? (
            <p className="rounded border border-dashed px-3 py-4 text-center text-xs" style={{ color: theme.muted, borderColor: theme.rule }}>
              Empty {BLOCK_LABEL[block.type].toLowerCase()} — it will not show on the page until you fill it in.
            </p>
          ) : (
            <Editable block={block} theme={theme} selected={selected} onPatch={onPatch} />
          )}
        </div>
      </div>

      {dropAt === `${zoneId}:${index + 1}` && <DropLine label={dragLabel} />}
    </div>
  );
}

/**
 * Type straight into the canvas for the fields that are plain text.
 *
 * Editable only once the block is SELECTED. The first click selects it, the
 * next one puts the caret in — which is how Elementor behaves, and which fixes
 * the thing that made this feel broken: the wrapper used to swallow every
 * click to protect the caret, so clicking a heading did nothing at all. Its
 * controls never opened, and it looked like the canvas was dead.
 *
 * The value is written back on blur rather than on every keystroke: a state
 * change during typing re-renders the node and the caret jumps to the start.
 * Rich text stays in the panel, where that editor owns its own selection.
 */
function Editable({
  block,
  theme,
  selected,
  onPatch,
}: {
  block: Block;
  theme: BandTheme;
  selected: boolean;
  onPatch: (id: string, next: Block) => void;
}) {
  const device = useContext(CanvasDevice);
  const key = block.type === "heading" || block.type === "button" ? "text" : null;
  if (!key) return <BlockBody block={block} theme={theme} at={device} />;
  if (!selected) return <BlockBody block={block} theme={theme} at={device} />;
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      data-edit={key}
      title="Click to type"
      onBlur={(e) => {
        const next = e.currentTarget.textContent ?? "";
        if (next !== block.props[key]) {
          onPatch(block.id, { ...block, props: { ...block.props, [key]: next } });
        }
      }}
      // Only now, once it is the selected block: re-selecting it would
      // re-render the node and take the caret with it.
      onClick={(e) => e.stopPropagation()}
      className="cursor-text outline-none"
    >
      <BlockBody block={block} theme={theme} at={device} />
    </div>
  );
}

function RowColumns({
  block,
  theme,
  selectedId,
  dropAt,
  setDropAt,
  onSelect,
  onDrop,
  onDragStart,
  onDragEnd,
  onPatch,
}: {
  block: Block;
  theme: BandTheme;
  selectedId: string | null;
  dropAt: string | null;
  setDropAt: (v: string | null) => void;
  onSelect: (id: string) => void;
  onContext?: (e: React.MouseEvent, block: Block) => void;
  onDrop: (t: DropTarget) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onPatch: (id: string, next: Block) => void;
}) {
  const device = useContext(CanvasDevice);
  // The same layout the page gets, applied directly — the canvas is 390px
  // inside a full-size window, so its media queries never fire. Without this
  // the phone view shows two columns side by side and the editor is lying
  // about the thing you switched to it to check.
  const layout = rowLayout(block, device);
  const columns = block.columns ?? [];
  return (
    <div style={layout.container}>
      {columns.map((col, c) => {
        const colId = `${block.id}#${c}`;
        return (
        <div
          key={c}
          onClick={(e) => {
            // Only when the click was not on a block inside it. A column is the
            // thing behind its contents, so it is what a click on the space
            // around them means.
            e.stopPropagation();
            onSelect(colId);
          }}
          className={
            selectedId === colId
              ? "outline outline-2 outline-offset-1 outline-[var(--primary)]"
              : "hover:outline hover:outline-1 hover:outline-offset-1 hover:outline-[var(--border)]"
          }
          style={{
            borderColor: theme.rule,
            ...layout.columns[c],
            ...columnCss(block, c, theme),
          }}
        >
          <Zone
            emptyLabel="Drop here"
            className="flex min-h-[64px] flex-col rounded border border-dashed p-1.5"
            blocks={col}
            theme={theme}
            zoneId={`${block.id}:${c}`}
            selectedId={selectedId}
            dropAt={dropAt}
            setDropAt={setDropAt}
            onSelect={onSelect}
            onDrop={onDrop}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onPatch={onPatch}
            target={(index) => ({ zone: "column", rowId: block.id, column: c, index })}
          />
        </div>
        );
      })}
    </div>
  );
}

/**
 * Where it will land — a gap that opens, not a line to interpret.
 *
 * A line has to be read: which side of it, and at which nesting level. The gap
 * IS the answer, drawn at the size the block will occupy, and the label removes
 * the last of the guessing inside nested columns.
 */
function DropLine({ label }: { label?: string | null }) {
  return (
    <div
      data-dropline
      className="my-1 flex h-9 items-center justify-center rounded-lg border-2 border-dashed border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[0.62rem] text-primary"
    >
      {label ? `Drop ${label} here` : "Drop here"}
    </div>
  );
}

/**
 * The block travelling with the cursor.
 *
 * The browser's own drag image is a screenshot of whatever was grabbed, which
 * for a palette tile is a tile and for a block handle is a 20px chip. Neither
 * says what is being moved once the cursor is somewhere else, so both are
 * suppressed and this is drawn instead.
 */
function DragTile({ label, type }: { label: string; type: BlockType | null }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    // dragover rather than mousemove: during an HTML5 drag no mouse events
    // fire at all, so a tile bound to those would sit still.
    const move = (e: DragEvent) => setAt({ x: e.clientX, y: e.clientY });
    window.addEventListener("dragover", move);
    return () => window.removeEventListener("dragover", move);
  }, []);
  if (!at) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] flex min-w-[5.5rem] flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2.5 text-[0.68rem] shadow-[0_18px_38px_-14px_rgba(0,0,0,.45)]"
      style={{ left: at.x + 16, top: at.y - 16 }}
    >
      {type && (
        <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current text-muted">
          <path d={BLOCK_ICON[type]} />
        </svg>
      )}
      <span>{label}</span>
    </div>,
    document.body,
  );
}

// --- one control ------------------------------------------------------------

function ControlField({
  control,
  block,
  device = "desktop",
  onChange,
  onClear,
  onPickAlt,
}: {
  control: Control;
  block: Block;
  device?: Device;
  onChange: (v: unknown) => void;
  onClear?: () => void;
  onPickAlt?: (alt: string) => void;
}) {
  if (isGroup(control)) return null;
  const value = readControl(block, control, device);
  // Said where the number is, not in a console nobody opens.
  const notice =
    "key" in control && control.key === "padding" && device !== "mobile"
      ? mobilePaddingNotice(block)
      : null;
  // Only style controls have a wider device to inherit from; a heading's text
  // is the same words at every width.
  const at = deviceOf(control, device);
  const set = at !== "desktop" && hasOverride(block, at, control.key.split(".")[0], scopeOf(control));
  // The label, and the marker saying this control is holding a value for the
  // width being edited. A control that does not say so is one you will change
  // on desktop and wonder why nothing moved.
  const label = (
    <span className="flex min-w-0 items-start gap-1.5 text-xs text-fg">
      {/* Wrapping, not truncating. "Stack into one" became "Stack into o…",
          which is a label that has stopped being one. */}
      <span className="leading-tight">{control.label}</span>
      {set && (
        <button
          type="button"
          onClick={onClear}
          title={`Set for ${at}. Click to use the ${at === "mobile" ? "tablet" : "desktop"} value again.`}
          className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[0.58rem] leading-4 text-primary hover:bg-primary/25"
          aria-label={`Reset ${control.label} for ${at}`}
        >
          {at} ✕
        </button>
      )}
    </span>
  );

  /**
   * One control, one row: name on the left, the thing you change on the right.
   *
   * Every control used to be a full-width stack — label, an explaining
   * paragraph, then the field — so four of them filled the panel and everything
   * else was scrolling. `stack` is for the ones that are genuinely typed rather
   * than nudged: a body of text in a 190px column is worse than no layout.
   */
  const row = (field: React.ReactNode, opts: { stack?: boolean; value?: React.ReactNode } = {}) => (
    <div className="flex flex-col gap-1">
      <div
        className={
          opts.stack
            ? "flex flex-col gap-1.5"
            : "grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5"
        }
      >
        <span className="flex items-center justify-between gap-1.5">
          {label}
          {opts.value && <span className="text-[0.62rem] tabular-nums text-muted">{opts.value}</span>}
        </span>
        {field}
      </div>
      {control.hint && <p className="text-[0.66rem] leading-snug text-muted">{control.hint}</p>}
      {notice && <p className="text-[0.66rem] leading-snug text-primary">{notice}</p>}
    </div>
  );

  switch (control.kind) {
    case "text":
      return row(
        <input
          className={input}
          value={typeof value === "string" ? value : ""}
          placeholder={control.placeholder}
          aria-label={control.label}
          onChange={(e) => onChange(e.target.value)}
        />,
      );

    case "image":
      return (
        <ImageControl
          label={label}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          onPickAlt={onPickAlt}
        />
      );

    case "textarea":
      // Stacked: prose is typed, and typing it in a narrow right-hand column
      // makes the one thing people actually write the hardest thing to write.
      return row(
        <textarea
          className={`${input} ${control.mono ? "font-mono text-[0.72rem]" : ""}`}
          rows={control.rows ?? 3}
          value={typeof value === "string" ? value : ""}
          aria-label={control.label}
          onChange={(e) => onChange(e.target.value)}
        />,
        { stack: true },
      );

    case "richtext":
      return row(<RichText value={typeof value === "string" ? value : ""} onChange={onChange} />, {
        stack: true,
      });

    case "select": {
      const current = String(value ?? "");
      // Few enough options to show them all: a dropdown hides its choices until
      // opened, which turns picking one of three alignments into two clicks and
      // a read.
      if (asSegment(control)) {
        const icons = SEGMENT_ICONS[control.key.split(".").pop() ?? ""];
        return row(
          <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label={control.label}>
            {control.options.map(([v, l]) => (
              <button
                key={v}
                type="button"
                title={l}
                aria-label={l}
                aria-pressed={current === v}
                onClick={() => onChange(coerce(v))}
                className={`flex min-w-0 flex-1 items-center justify-center truncate border-r border-border px-1 py-1.5 text-[0.68rem] last:border-r-0 ${
                  current === v ? "bg-primary/12 text-primary" : "text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                {icons?.[v] ? (
                  <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
                    <path d={icons[v]} />
                  </svg>
                ) : (
                  l
                )}
              </button>
            ))}
          </div>,
        );
      }
      return row(
        <select
          className={input}
          value={current}
          aria-label={control.label}
          onChange={(e) => onChange(coerce(e.target.value))}
        >
          {control.options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>,
      );
    }

    case "toggle": {
      // `hideMobile` is true when a block is GONE, so a switch reading it
      // directly is on when the thing is off. Inverted controls show and write
      // the opposite, which is what lets every switch mean the same thing.
      const stored = value === true;
      const shown = control.invert ? !stored : stored;
      return row(
        <button
          type="button"
          role="switch"
          aria-checked={shown}
          aria-label={control.label}
          onClick={() => onChange(control.invert ? shown : !stored)}
          className={`relative h-[18px] w-8 shrink-0 justify-self-start rounded-full transition-colors ${
            shown ? "bg-[#3f9b6d]" : "bg-border"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform ${
              shown ? "translate-x-3.5" : "translate-x-0"
            }`}
          />
        </button>,
      );
    }

    case "columns": {
      const count = block.columns?.length ?? 0;
      return (
        <label className="flex flex-col gap-1">
          {label}
          <select
            className={input}
            value={count}
            onChange={(e) => onChange(Number(e.target.value))}
          >
            {Array.from({ length: control.max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} column{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          {count > 1 && (
            <span className="text-[0.66rem] text-muted">
              Fewer columns moves what is in them into the last one — nothing is deleted.
            </span>
          )}
        </label>
      );
    }

    case "widths": {
      const count = block.columns?.length ?? 0;
      if (count < 2) return null;
      // What is actually drawn at this width, not what is stored — on a phone
      // that is 100 per column until someone says otherwise, and a panel
      // showing 60/40 beside a stacked canvas is a panel telling a lie.
      const widths = effectiveWidths(block, at);
      return (
        <div className="flex flex-col gap-1.5">
          {label}
          {/* One field per column, because "column width for each" is the thing
              being asked for. Setting one takes the difference from the others
              in proportion, so the row always adds up to a row. */}
          <div className="flex flex-wrap gap-1.5">
            {widths.map((w, i) => (
              <label key={i} className="flex flex-1 basis-16 flex-col gap-0.5">
                <span className="text-[0.62rem] text-muted">Col {i + 1}</span>
                <input
                  type="number"
                  // Labelled, not merely captioned: the "Col 1" above it is a
                  // sibling span, which a screen reader does not connect and a
                  // selector cannot rely on.
                  aria-label={`Column ${i + 1} width`}
                  data-column-width
                  min={5}
                  max={95}
                  step={1}
                  className={`${input} px-1.5 text-center tabular-nums`}
                  value={Math.round(w * 100) / 100}
                  onChange={(e) => onChange(setColumnWidth(widths, i, Number(e.target.value)))}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onChange(evenWidths(count))}
              className="rounded-full border border-border px-2 py-0.5 text-[0.62rem] text-muted transition-colors hover:border-primary hover:text-fg"
            >
              Even
            </button>
            {/* 100 and 100 for a two-column row is correct on a phone and looks
                exactly like a bug, because nothing else on screen says the
                columns have stopped being side by side. */}
            {stacksAt(block, at) && (
              <span className="text-[0.62rem] leading-tight text-muted">
                Stacked here — each is full width. Type one to override.
              </span>
            )}
          </div>
        </div>
      );
    }

    case "number":
      // Slider AND a number you can type. A slider alone cannot reliably hit 15,
      // and a number alone cannot be explored.
      return row(
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            className="min-w-0 flex-1 accent-[var(--primary)]"
            aria-label={control.label}
            min={control.min}
            max={control.max}
            step={control.step}
            value={typeof value === "number" ? value : control.min}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <input
            type="number"
            aria-label={`${control.label} value`}
            min={control.min}
            max={control.max}
            step={control.step}
            value={typeof value === "number" ? value : ""}
            placeholder="—"
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className="w-11 shrink-0 rounded border border-border bg-surface px-1 py-1 text-center text-[0.68rem] tabular-nums outline-none focus:border-primary"
          />
          {/* Clearing is how a value goes back to inheriting from the band, so
              it has to be reachable — not only settable. */}
          <button
            type="button"
            title="Use the theme's value"
            aria-label={`Reset ${control.label}`}
            onClick={() => onChange(null)}
            className="shrink-0 rounded px-0.5 text-[0.62rem] text-muted hover:text-fg"
          >
            ✕
          </button>
        </div>,
        { value: control.unit && typeof value === "number" ? control.unit : undefined },
      );

    case "position":
      return row(
        <PositionPicker
          value={typeof value === "string" ? value : "center center"}
          onChange={onChange}
        />,
        { stack: true },
      );

    case "color":
      return row(
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            aria-label={control.label}
            className="size-7 shrink-0 rounded border border-border bg-surface"
            value={typeof value === "string" ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="min-w-0 flex-1 truncate font-mono text-[0.66rem] text-muted">
            {typeof value === "string" ? value : "theme"}
          </span>
          <button
            type="button"
            title="Follow the section's band"
            aria-label={`Reset ${control.label}`}
            onClick={() => onChange(null)}
            className="shrink-0 rounded px-0.5 text-[0.62rem] text-muted hover:text-fg"
          >
            ✕
          </button>
        </div>,
      );

    case "dim": {
      const d = (value ?? { t: 0, r: 0, b: 0, l: 0, u: "px", link: false }) as Record<string, number | string | boolean>;
      return (
        <div className="flex flex-col gap-1">
          {label}
          <div className="flex items-center gap-1">
            {(["t", "r", "b", "l"] as const).map((side) => (
              <input
                key={side}
                type="number"
                aria-label={`${control.label} ${side}`}
                className="w-full rounded border border-border bg-surface px-1 py-1 text-center text-xs"
                value={Number(d[side] ?? 0)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange(d.link ? { ...d, t: n, r: n, b: n, l: n } : { ...d, [side]: n });
                }}
              />
            ))}
            <button
              type="button"
              aria-label="Link sides"
              title="Link all four sides"
              onClick={() => onChange({ ...d, link: !d.link })}
              className={`rounded px-1 text-xs ${d.link ? "text-fg" : "text-muted"}`}
            >
              ⛓
            </button>
          </div>
        </div>
      );
    }

    case "list": {
      const rows = Array.isArray(value) ? (value as Record<string, string>[]) : [];
      return (
        <div className="flex flex-col gap-1.5">
          {label}
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-lg border border-border p-2">
              {control.item.map((f) =>
                f.kind === "textarea" ? (
                  <textarea
                    key={f.key}
                    rows={2}
                    aria-label={f.label}
                    placeholder={f.label}
                    className={input}
                    value={row[f.key] ?? ""}
                    onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, [f.key]: e.target.value } : r)))}
                  />
                ) : (
                  <input
                    key={f.key}
                    aria-label={f.label}
                    placeholder={f.label}
                    className={input}
                    value={row[f.key] ?? ""}
                    onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, [f.key]: e.target.value } : r)))}
                  />
                ),
              )}
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="w-fit text-[0.66rem] text-muted hover:text-primary"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...rows, Object.fromEntries(control.item.map((f) => [f.key, ""]))])}
            className="w-fit rounded-full border border-dashed border-border px-3 py-1 text-[0.7rem] text-muted hover:border-fg hover:text-fg"
          >
            + {control.addLabel}
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}

/** A select's value is a string; the ones that are really numbers come back as numbers. */
function coerce(v: string): string | number {
  return /^\d+$/.test(v) ? Number(v) : v;
}

/**
 * An image: uploaded, or a pasted address.
 *
 * The upload writes into the draft rather than straight to the row — the page's
 * one Save owns persistence, and an image that appeared before Save would be
 * the only thing on this screen behaving differently from everything else.
 */
export function ImageControl({
  label,
  value,
  onChange,
  onPickAlt,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: unknown) => void;
  /** The description this image already has, when one is chosen from the library. */
  onPickAlt?: (alt: string) => void;
}) {
  const src = imageSrc(value);

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
      )}
      {/* The same image on three pages should be one file, not three uploads
          under three names. Its description comes with it. */}
      <MediaButton
        kind="image"
        label={src ? "Replace image" : "Select image"}
        onPick={(item) => {
          onChange(item.path);
          if (item.alt) onPickAlt?.(item.alt);
        }}
      />
      <input
        className={input}
        value={value}
        placeholder="…or paste a URL"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
