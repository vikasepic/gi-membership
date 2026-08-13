"use client";

import { MediaButton } from "@/components/admin/media-modal";
import { copyToClipboard, readClipboard, onClipboardChange, type Clip } from "@/lib/clipboard";
import { ContextMenu, menuAt, type MenuState } from "@/components/admin/context-menu";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlockBody, Blocks } from "@/components/page/blocks";
import { IconPicker } from "@/components/admin/icon-picker";
import { CanvasFrame } from "@/components/admin/canvas-frame";
import { SpacingGuide } from "@/components/admin/spacing-guide";
import { ColorControl, PaletteContext } from "@/components/admin/color-control";
import type { StoreRender } from "@/components/page/storefront-blocks";
import { RichText } from "@/components/editor/rich-text";
import {
  BLOCK_LABEL,
  BLOCK_ICON,
  CARD_TEMPLATES,
  matchedCardTemplate,
  columnControls,
  applyCardTemplate,
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
import { canExplode, explodeWarnings, takeApart } from "@/lib/cards-to-blocks";
import {
  addTarget,
  blockRendersNothing,
  MAX_COLUMNS,
  duplicateBlock,
  duplicateColumn,
  removeColumn,
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
  emptyBackground,
  columnAsBlock,
  setColumnStyle,
  splitColumnId,
  setColumnWidth,
  DEVICE_CANVAS,
  DEVICE_MAX,
  SITE_DEFAULTED_KEYS,
  type Block,
  type BlockType,
  type Device,
  type DropTarget,
} from "@/lib/blocks";
import { DeviceSwitch } from "@/components/admin/device-switch";
import { BlockTree } from "@/components/admin/block-tree";
import { TemplateLibrary } from "@/components/admin/template-library";
import { templateSource, type Template } from "@/lib/templates";
import { saveTemplateAction } from "@/app/admin/templates/actions";
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

/**
 * The catalogue and the memberships, for the canvas.
 *
 * A context rather than another prop threaded through the row, the column and
 * the block: `CanvasDevice` next door solved the same problem the same way, and
 * five signatures gaining a parameter each is how a tree becomes unreadable.
 * Undefined everywhere but the home page, where those blocks are offered.
 */
const CanvasStore = createContext<StoreRender | undefined>(undefined);

/**
 * The designs this page points at, by id — name included, because the panel
 * has to say what a block is linked TO.
 *
 * Context rather than a prop for the same reason the device is: it would
 * otherwise be threaded through Zone, CanvasBlock and RowColumns, none of
 * which have any use for it except to hand it on.
 */
export type GlobalIndex = Map<string, { name: string; blocks: Block[] }>;
const Globals = createContext<GlobalIndex>(new Map());
import { backgroundCss, blockClass, blockCssAt, blockCustomRules, blockTextRules, columnCss, columnOwnWidth, effectiveWidths, mobilePaddingNotice, rowIsGrid, rowLayout, stacksAt } from "@/lib/block-style";
import { imageSrc, normalizeSectionLayout, sectionBox } from "@/lib/page-sections";
import type { BandTheme } from "@/lib/page-sections";
import { PREVIEW_SCOPE, siteTypographyCssAt, type SitePreview } from "@/lib/site-typography";

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
  onSave,
  preview,
  owner = "product",
  store,
  globals,
  onSaveGlobal,
}: {
  blocks: Block[];
  theme: BandTheme;
  title: string;
  /**
   * Write everything, from in here.
   *
   * Optional: the two screens that open this without one — the template editor
   * and the nested global editor — have their own idea of what saving means,
   * and a button that says Save while saving nothing is worse than one that
   * says Done.
   */
  onSave?: () => Promise<void>;
  /**
   * Which kind of page this band belongs to.
   *
   * Only the tray reads it: Catalogue, Memberships and Featured draw live store
   * data that no page but the storefront supplies, so offering them elsewhere
   * would put blocks in the tray that render nothing wherever they are dropped.
   */
  owner?: "product" | "offer" | "store";
  /** Live catalogue and memberships, so Catalogue/Memberships/Featured draw
   *  something here instead of the nothing they drew before. Home page only. */
  store?: StoreRender;
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
  /**
   * The store's fonts and site typography.
   *
   * Without it the canvas shows the fonts the app was built with and none of
   * the site's own type, so a block that sets no size of its own renders here
   * at a size no visitor will ever see — which is the one thing a canvas that
   * renders the live components exists to avoid.
   */
  preview?: SitePreview;
  /**
   * The global designs this page points at.
   *
   * Absent means a canvas that draws pointers as pointers — which is what the
   * nested editor below wants, since a design containing a pointer is exactly
   * the one level this does not resolve.
   */
  globals?: GlobalIndex;
  /**
   * Save a global design's own blocks. Absent hides "Edit globally", so the
   * button is missing rather than present and broken.
   */
  onSaveGlobal?: (id: string, blocks: Block[]) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  // Which width is being edited. One piece of state for both halves: the canvas
  // narrows and the inspector writes to the same device, because a panel that
  // edits mobile while the canvas shows desktop is a panel you cannot trust.
  const [device, setDevice] = useState<Device>("desktop");
  // The canvas width, dragged. Null means "take the pane", which is what
  // desktop means and what the real page does with a window.
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);
  // Pressing a tab jumps to that tab's width — desktop's null still means
  // "take the pane". Dragging then moves the tab back, because the width is
  // what the page's media queries actually read.
  const pickDevice = (d: Device) => {
    setDevice(d);
    setCanvasWidth(DEVICE_CANVAS[d]);
  };
  const drag = useRef<DragPayload | null>(null);
  const [search, setSearch] = useState("");
  const [left, setLeft] = useState<"add" | "structure">("add");
  // Reset whenever the selection changes, so a pending "Delete it" never lands
  // on a block someone has since moved to.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Drawn with the same function the live band uses, so the canvas cannot show
  // one thing and the page another.
  // The store's type, for the width the canvas is showing. Not media queries:
  // the canvas is 390px wide inside a 1900px window, so `max-width:767px` never
  // matches there — the same reason blockCssAt applies a style attribute rather
  // than emitting rules. Scoped to the canvas class, because these selectors
  // name elements and the admin's own chrome is made of the same elements.
  const previewCss = useMemo(
    () =>
      preview
        ? [preview.fontCss, siteTypographyCssAt(preview.typography, device, `.${PREVIEW_SCOPE}`)]
            .filter(Boolean)
            .join("\n")
        : "",
    [preview, device],
  );
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

  /**
   * The menu for a column, which is not a block.
   *
   * A right-click on one used to bubble to the row and open the ROW's menu —
   * so "Duplicate" on a column duplicated the whole container, which is a very
   * different thing to be handed when you asked for one column.
   */
  const columnMenu = (e: React.MouseEvent, row: Block, index: number) => {
    const count = row.columns?.length ?? 0;
    setMenu(
      menuAt(e, [
        {
          label: "Duplicate this column",
          onSelect: () => {
            const next = duplicateColumn(row, index);
            if (next === row) return;
            commit(updateBlock(blocks, row.id, () => next));
            setSelectedId(`${row.id}#${index + 1}`);
          },
          disabled: count >= MAX_COLUMNS ? `A container holds at most ${MAX_COLUMNS}` : undefined,
        },
        {
          label: "Edit the container",
          onSelect: () => setSelectedId(row.id),
        },
        {
          label: "Delete this column",
          danger: true,
          onSelect: () => {
            commit(updateBlock(blocks, row.id, (b) => removeColumn(b, index)));
            setSelectedId(row.id);
          },
          disabled: count <= 1 ? "A container needs one column" : undefined,
        },
      ]),
    );
  };

  const [families, setFamilies] = useState<string[]>([]);
  // The store's offers, so a Ways to pay block can name which one it sells.
  // Fetched here rather than threaded from the server for the same reason the
  // fonts are: it is one list, wanted by one control, on one screen.
  const [offerOptions, setOfferOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let alive = true;
    void fetch("/api/offers")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { offers?: { id: string; name: string }[] } | null) => {
        if (alive && j?.offers) setOfferOptions(j.offers);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
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
      // One authority for what may go where — `insertBlock`. This used to carry
      // its own copy of "a container cannot go in a column", which outlived the
      // rule: the drop zone lit up, the drop was accepted, and the block was
      // thrown away between the two. A tree that comes back unchanged means the
      // target was refused, so nothing is committed and nothing is selected.
      const next = insertBlock(blocks, block, target);
      if (next === blocks) return;
      commit(next);
      setSelectedId(block.id);
      setTab("content");
    } else {
      commit(moveBlock(blocks, payload.id, target));
    }
  }

  // The library popup, and whether the export has just been copied.
  // Saving from in here, and what to say when it does not work.
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  const [exported, setExported] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Keep this section as a design, under a name.
   *
   * The band goes with it — colour, width and air — because that is what made
   * the difference between a template that looks like the screenshot and one
   * that needs a paragraph of instructions afterwards.
   */
  async function saveAsTemplate() {
    if (blocks.length === 0 || saving) return;
    const name = window.prompt("Name this design", title)?.trim();
    if (!name) return;
    setSaving(true);
    const bg = section?.background;
    const fd = new FormData();
    fd.append("name", name);
    fd.append("group", "Saved");
    fd.append("blocks", JSON.stringify(blocks));
    fd.append(
      "band",
      JSON.stringify({
        style: section?.style ?? "paper",
        color: bg && bg.type === "classic" ? (bg.color ?? null) : null,
        layout: normalizeSectionLayout(section?.layout),
      }),
    );
    const res = await saveTemplateAction({}, fd);
    setSaving(false);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  /**
   * Drop a template at the same place a palette click would land a row.
   *
   * Fresh ids first — two copies of one template on one page must not share
   * them — then one insert per block, so a template is nothing the tree has to
   * know about: after this it is ordinary blocks, exactly as if each had been
   * placed by hand.
   */
  function insertTemplate(t: Template) {
    // A global is LINKED, not copied: what lands on the page is a pointer at
    // the row, so editing the design later changes this page too. Its blocks
    // are not copied in — they are resolved on read, which is the only way one
    // edit can reach pages nobody opens.
    //
    // Nor does a global bring a band. A copy may set the ground it was drawn
    // on because the page then owns every part of it; a link may not, because
    // the band would be written into THIS page and never change again — a
    // silent half-link is worse than no link at all.
    if (t.id.startsWith("global:")) {
      const pointer = newBlock("global");
      const linked: Block = {
        ...pointer,
        props: { ...pointer.props, globalId: t.id.slice("global:".length) },
      };
      const at = addTarget(blocks, selectedId, "row");
      commit(
        insertBlock(blocks, linked, {
          zone: "root",
          index: at.zone === "root" ? at.index : blocks.length,
        }),
      );
      setSelectedId(linked.id);
      setLibrary(false);
      return;
    }
    // The band comes with the design. A template is blocks, and blocks cannot
    // paint the ground they stand on — so until the section grew a width and a
    // colour of its own, "now set the background to #e9dde6" was a step in a
    // document, which is a step nobody performs. One press, one design.
    if (t.band && section) {
      const patch: Record<string, unknown> = {};
      if (t.band.style) patch.style = t.band.style;
      if (t.band.color !== undefined) {
        patch.background = { ...emptyBackground(), type: "classic", color: t.band.color };
      }
      if (t.band.layout) patch.layout = { ...normalizeSectionLayout(section.layout), ...t.band.layout };
      if (Object.keys(patch).length > 0) section.onChange(patch);
    }
    const fresh = t.blocks.map(reid);
    const at = addTarget(blocks, selectedId, "row");
    const start = at.zone === "root" ? at.index : blocks.length;
    let next = blocks;
    fresh.forEach((b, i) => {
      next = insertBlock(next, b, { zone: "root", index: start + i });
    });
    commit(next);
    if (fresh[0]) setSelectedId(fresh[0].id);
    setLibrary(false);
  }

  /** The design being edited through this page, if the panel opened one. */
  const [editingGlobal, setEditingGlobal] = useState<{ id: string; name: string; blocks: Block[] } | null>(null);
  const index = globals ?? new Map();

  /**
   * Keep what this page has now, and stop receiving changes.
   *
   * The pointer is replaced, IN THIS PAGE ONLY, by the design's blocks under
   * fresh ids. From here they are ordinary blocks the page owns. One way: to
   * go back you insert the global again, which is a smaller surprise than a
   * re-link that silently discards whatever was edited in the meantime.
   */
  function unlink(block: Block) {
    const id = typeof block.props.globalId === "string" ? block.props.globalId : "";
    const linked = index.get(id);
    if (!linked) return;
    const found = findBlock(blocks, block.id);
    if (!found) return;
    if (
      !window.confirm(
        `Unlink “${linked.name}”?\n\nThis page keeps what it has now and stops receiving changes. Every other page using it is untouched.`,
      )
    ) {
      return;
    }
    const copies = linked.blocks.map(reid);
    let next = removeBlock(blocks, block.id);
    copies.forEach((b: Block, i: number) => {
      next = insertBlock(next, b, { zone: "root", index: found.index + i });
    });
    commit(next);
    setSelectedId(copies[0]?.id ?? null);
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

  const tabs = !selected
    ? null
    : column
      ? // Through `columnControls`, not COLUMN_CONTROLS raw: the column path
        // does not go through `controlsFor`, which is the only place a control's
        // `when` was ever evaluated.
        { content: [], style: columnControls(selected, rowIsGrid(column.row, device)), advanced: [] }
      : controlsFor(selected, families, offerOptions);

  /**
   * Select anything on the canvas or in the tree.
   *
   * The tab moves with it, in one place: a column has only a Style tab, and the
   * two call sites disagreeing meant clicking a column on the canvas landed on
   * an empty Content panel while clicking the same column in the tree did not.
   */
  function select(id: string) {
    setSelectedId(id);
    setTab(splitColumnId(id) ? "style" : "content");
  }

  /**
   * One writer for both.
   *
   * A column's edit has to be unwrapped back onto its row; a block's is written
   * as it is. Keeping that in one place is what stops the two paths drifting.
   */
  function applyEdit(next: Block, key?: string) {
    if (column)
      patch(
        column.row.id,
        setColumnStyle(column.row, column.index, next.style, next.responsive),
        key,
      );
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

  // One value for the whole screen; the controls that need it are four levels
  // down inside a switch statement.
  const palette = preview?.palette ?? [];

  const overlay = (
    <CanvasDevice.Provider value={device}>
    <CanvasStore.Provider value={store}>
    <Globals.Provider value={index}>
    <Dragging.Provider value={dragging}>
    <ColumnMenu.Provider value={columnMenu}>
    {/* The design itself, opened from a page that shows it.
        A second editor over the first rather than a trip to another screen,
        because the model chosen was "edit anywhere, changes everywhere" — and
        the thing being edited is the design, so the editor that edits designs
        is the honest one to open. It is given no index of its own, which is
        what stops a design containing a pointer from being edited three levels
        deep: that pointer draws as a pointer, and the resolve step expands one
        level anyway. */}
    {editingGlobal && (
      <BlockEditor
        blocks={editingGlobal.blocks}
        theme={theme}
        title={`${editingGlobal.name} — used on every page that links to it`}
        onChange={(next) => setEditingGlobal({ ...editingGlobal, blocks: next })}
        onClose={() => {
          const pending = editingGlobal;
          setEditingGlobal(null);
          void onSaveGlobal?.(pending.id, pending.blocks);
        }}
        preview={preview}
      />
    )}
    {dragging.label && <DragTile label={dragging.label} type={dragging.type} />}
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface-2">
      {/* Rendered at the editor's root and portalled to the body: a menu
          inside a scrolling pane scrolls away from what it belongs to. */}
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      <TemplateLibrary
        open={library}
        theme={theme}
        onClose={() => setLibrary(false)}
        onInsert={insertTemplate}
      />
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <strong className="font-display text-sm">Builder</strong>
        <span className="text-sm text-muted">{title}</span>
        <DeviceSwitch device={device} onChange={pickDevice} className="mx-auto" />
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
          {/* Keep this section as a design, on the shelf, for any page.
              The clipboard export beside it is for a design that should ship
              in code; this is for one that belongs to this store. */}
          <IconBtn
            label={saved ? "Saved to Templates" : "Save this section as a template"}
            onClick={() => void saveAsTemplate()}
            disabled={blocks.length === 0 || saving}
          >
            {saved ? "✓" : "＋"}
          </IconBtn>
          {/* The other half of the library: this section, read back out as a
              file for lib/templates/. The export runs the same normalize the
              save does, so what lands in the file is what a reload would show. */}
          <IconBtn
            label={exported ? "Copied — drop it into lib/templates/" : "Copy this section as a template file"}
            onClick={() => {
              void navigator.clipboard.writeText(templateSource(title, blocks)).then(() => {
                setExported(true);
                setTimeout(() => setExported(false), 2000);
              });
            }}
            disabled={blocks.length === 0}
          >
            {exported ? "✓" : "⇪"}
          </IconBtn>
        </div>
        <span className="text-xs text-muted">
          {blocks.length === 0 ? "Empty" : `${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
        </span>
        {saveFailed && (
          <span className="max-w-[28rem] truncate text-xs text-primary" title={saveFailed}>
            {saveFailed}
          </span>
        )}
        {/* One button, not two. "Back to the page" sat beside this one and
            called the same onClose, and a secondary beside a primary reads as
            "leave" beside "keep" — so the pair taught people that one of the
            two loses work. Escape is the other way out and still needs no
            label; see the key handler.

            It says Save now, and means it. Edits stream into the draft either
            way, but "Done" then sent you back to a page still holding unsaved
            work with a Save button of its own — two steps, and the second one
            easy to walk away from. It only says Save where there is something
            to save it with. */}
        <button
          type="button"
          onClick={async () => {
            if (!onSave) return onClose();
            if (busy) return;
            setBusy(true);
            setSaveFailed(null);
            try {
              await onSave();
              onClose();
            } catch (e) {
              // Left OPEN on failure, with the reason. Closing onto a page that
              // did not write is how an afternoon's work is lost while the
              // screen says it went fine.
              setSaveFailed(e instanceof Error ? e.message : "That did not save. Try again.");
            }
            setBusy(false);
          }}
          disabled={busy}
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
        >
          {onSave ? (busy ? "Saving…" : "Save") : "Done"}
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
              onSelect={select}
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
            {/* The shelf. A whole design at once, where single blocks are
                added — because "start me off" and "add one more thing" are
                the same gesture at different sizes. */}
            <button
              type="button"
              onClick={() => setLibrary(true)}
              className="mt-2 w-full rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
            >
              Add from library
            </button>
          </div>
          {groupedPalette(search, owner).map((g) => (
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
          {groupedPalette(search, owner).length === 0 && (
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
          {/* Later in the document than the section preview's copy of the same
              rules — this overlay is portalled to the end of the body — so
              while the builder is open its width is the one that wins. The
              preview underneath it is covered anyway. */}
          {previewCss && <style dangerouslySetInnerHTML={{ __html: previewCss }} />}
          {/* @container, because the page has one and the canvas did not.
              A cards grid is `grid-cols-1 @xl:grid-cols-[var(--cards)]`, and a
              container query with no container ancestor never matches — so the
              editor drew every cards block as a single stacked column no matter
              which layout was chosen, while the live page laid them out in four.
              Picking Tiles and being shown a list is the editor lying about the
              page, which is the one thing it may not do.
              The width it queries is this element's, and this element is the
              device canvas — so the phone view now answers the phone's question
              rather than the laptop's. */}
          {/* Two boxes, the same two the page has: the outer one is the band
              (it is what @container measures, and what carries the band's own
              padding), the inner one is the measure the content is held to.
              The canvas drew a single box and ignored the section's layout
              entirely — so Width, Measure and the paddings wrote values that
              the page honoured and the builder did not, which reads as "these
              settings don't work" because from in here they didn't. */}
          <CanvasFrame device={device} width={canvasWidth} onWidth={setCanvasWidth} onDevice={setDevice}>
          <div
            className={`${PREVIEW_SCOPE} @container mx-auto w-full transition-[max-width] duration-200`}
            style={{
              // Desktop takes the whole pane rather than a 900px stand-in.
              // The page's own measure is 1040, so a canvas capped at 900 was
              // always narrower than the thing it was previewing: a row set to
              // Boxed looked identical to Full, because both were being cut
              // off by the canvas before either could reach its own limit.
              //
              // The frame around this now owns the width, so there is no
              // second cap here fighting it.
              ...sectionBox(section?.layout).outer,
            }}
          >
          <div className="w-full" style={sectionBox(section?.layout).inner}>
            <Zone
              blocks={blocks}
              theme={theme}
              zoneId="root"
              selectedId={selectedId}
              dropAt={dropAt}
              setDropAt={setDropAt}
              onContext={blockMenu}
              onSelect={select}
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
              // Inside the zone, so the box that says "drag a block here" is
              // the box that takes the block. It used to sit BESIDE the zone:
              // the invitation accepted nothing, and the strip that did accept
              // was a thin line above it. You aimed at the box and the block
              // landed somewhere else.
              empty={
                <div
                  className={`flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm transition-colors ${
                    dropAt?.startsWith("root:") ? "border-primary text-primary" : ""
                  }`}
                  style={
                    dropAt?.startsWith("root:")
                      ? undefined
                      : { color: theme.muted, borderColor: theme.rule }
                  }
                >
                  <span>
                    {dropAt?.startsWith("root:")
                      ? `Drop ${dragging.label ?? "it"} here`
                      : "Drag a block here, or click one on the left."}
                  </span>
                  {/* Without this the only way to paste is beside an existing
                      block, and the section you most want to paste into is the
                      empty one. Pointer events are its own: the box around it
                      must not swallow the drop. */}
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
              }
            />

          </div>
          </div>
          </CanvasFrame>
        </div>

        {/* Inspector */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-l border-border bg-surface">
          {selected && selected.type === "global" ? (
            // A pointer has nothing of its own to edit, so the usual tabs would
            // be three empty panels. What it has instead is a relationship, and
            // the two things you can do about one.
            <LinkedPanel
              name={index.get(String(selected.props.globalId ?? ""))?.name ?? null}
              canEdit={!!onSaveGlobal && index.has(String(selected.props.globalId ?? ""))}
              onEdit={() => {
                const id = String(selected.props.globalId ?? "");
                const linked = index.get(id);
                if (linked) setEditingGlobal({ id, name: linked.name, blocks: linked.blocks });
              }}
              onUnlink={() => unlink(selected)}
              onDelete={() => {
                commit(removeBlock(blocks, selected.id));
                setSelectedId(null);
              }}
            />
          ) : !selected || !tabs ? (
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
                    <>
                      {/* A column is its own thing after all. The count
                          dropdown adds an EMPTY one and resets every width to
                          even, so using it to copy a 70/30 hero column loses
                          both the content and the layout. These two keep the
                          blocks, keep the column's own background and padding,
                          and only touch the width of the column involved. */}
                      <IconBtn
                        label="Duplicate this column"
                        onClick={() => {
                          const next = duplicateColumn(column.row, column.index);
                          if (next === column.row) return;
                          commit(updateBlock(blocks, column.row.id, () => next));
                          setSelectedId(`${column.row.id}#${column.index + 1}`);
                        }}
                      >
                        ⧉
                      </IconBtn>
                      {(column.row.columns?.length ?? 0) > 1 && (
                        <IconBtn
                          label="Remove this column and its blocks"
                          onClick={() => {
                            commit(
                              updateBlock(blocks, column.row.id, (b) =>
                                removeColumn(b, column.index),
                              ),
                            );
                            setSelectedId(column.row.id);
                          }}
                        >
                          🗑
                        </IconBtn>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedId(column.row.id)}
                        className="rounded px-2 text-[0.68rem] text-muted hover:text-fg"
                      >
                        Edit the row
                      </button>
                    </>
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
                {tab === "content" && !column && selected.type === "cards" && (
                  <CardTemplates
                    block={selected}
                    device={device}
                    canTakeApart={canExplode(blocks, selected.id)}
                    onTakeApart={() => {
                      // Its own undo step, and a selection that survives it:
                      // the block being edited is gone, so keeping it selected
                      // would leave the panel pointing at nothing.
                      commit(takeApart(blocks, selected.id), `explode:${selected.id}`);
                      setSelectedId(null);
                    }}
                    onApply={(id) => {
                      // Pressing the template you are already on returns the
                      // block by identity. Committing that anyway would push an
                      // undo step for a press that changed nothing, and wipe the
                      // redo stack while it was there.
                      const next = applyCardTemplate(selected, id);
                      if (next === selected) return;
                      // Its own undo key, so one press is one step back — and a
                      // press that follows a slider drag does not fold into it.
                      applyEdit(next, `template:${selected.id}:${id}`);
                    }}
                  />
                )}
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
                          writeControl(selected, c, v, device),
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
    </ColumnMenu.Provider>
    </Dragging.Provider>
    </Globals.Provider>
    </CanvasStore.Provider>
    </CanvasDevice.Provider>
  );

  // Portalled to the body. The editor's own panes are position: sticky, which
  // creates a stacking context — so a fixed overlay inside one is trapped in
  // it and paints underneath the admin header. There is no z-index that fixes
  // that; it has to leave the subtree.
  const wrapped = <PaletteContext.Provider value={palette}>{overlay}</PaletteContext.Provider>;
  return typeof document === "undefined" ? wrapped : createPortal(wrapped, document.body);
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

/**
 * The right-click menu for a column.
 *
 * A context rather than a prop threaded through Zone and the block wrapper to
 * reach RowColumns: it is one function that never changes, and the two layers
 * in between have no use for it.
 */
const ColumnMenu = createContext<((e: React.MouseEvent, row: Block, index: number) => void) | null>(
  null,
);

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
  empty,
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
  /**
   * Rendered inside the zone when it holds nothing.
   *
   * Inside, because the zone IS the drop target. The canvas used to draw its
   * inviting dashed box as a SIBLING of the zone, so the box that said "drag a
   * block here" accepted nothing and the strip that did accept it was a thin
   * line above — you aimed at the box and the block landed somewhere else.
   */
  empty?: React.ReactNode;
  /** Shown when the zone is empty and no `empty` node is given. */
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
      {blocks.length === 0 &&
        (empty ?? (
          // An empty column is invisible until something is dragged near it,
          // which is exactly when it needs to exist. pointer-events-none so the
          // words cannot become the drop target and swallow the event before
          // the zone sees it.
          <p
            className="pointer-events-none py-3 text-center text-[0.68rem]"
            style={{ opacity: armed ? 1 : 0.7, color: armed ? "var(--primary)" : undefined }}
          >
            {armed ? `Drop ${dragLabel ?? "it"} here` : emptyLabel}
          </p>
        ))}
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
  // The block's own typography AND its hand-written CSS.
  //
  // Custom CSS used to be emitted by `blockRules` alone, which only the live
  // page reaches — the canvas renders pinned to a device and takes
  // `blockTextRules`, which carries type and ink and nothing else. So every
  // Custom CSS rule was invisible here: a button given a gradient showed as
  // the flat band accent in the builder and as the gradient to a buyer. The
  // canvas exists to be what the page is; a rule it silently drops is the one
  // thing it may not do.
  const textRules = blockTextRules(block, device) + blockCustomRules(block);
  // The element the guide measures — held in state, not a ref, because a ref
  // filled in after the first paint never tells anybody it happened. The
  // callback is stable so React attaches it once rather than on every render.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const boxRef = useCallback((n: HTMLDivElement | null) => setBox(n), []);

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
        // A block can contain a real link — a button block with a href is an
        // `<a>`, and a rich-text block can hold any number of them. Left to its
        // default, clicking one in the CANVAS navigates the admin: an in-page
        // href jumps the editor, an external one leaves it, and either way the
        // selection you were trying to make is gone and the panel falls back to
        // the section. The click still selects; it just stops going anywhere.
        if ((e.target as HTMLElement).closest?.("a")) e.preventDefault();
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

      {/* `flex flex-col`, because that is what holds a block on the page.
          `Blocks` in components/page/blocks.tsx is a column flex container, so
          every block wrapper is a flex ITEM — and a flex item with an auto
          cross-axis margin is not stretched: it takes its content's width and
          the margin moves it. Here the wrapper was an ordinary block box, which
          fills its parent and resolves `margin-inline: auto` to nothing. So
          Block position centred a button on the live page and did absolutely
          nothing in the canvas — someone centres it, sees no movement, and
          reaches for padding instead. One item per container rather than the
          page's many, which changes nothing across the axis alignment uses. */}
      <div
        className={`relative flex flex-col rounded-sm ${selected ? "outline outline-2 outline-offset-2 outline-[var(--primary)]" : "hover:outline hover:outline-1 hover:outline-offset-2 hover:outline-[var(--border)]"}`}
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

        {/* The wrapper as an attribute, the text it holds as a rule. An
            attribute cannot name a child, and the children are where the
            canvas's own `.site-type h2` would otherwise beat the block. A block
            that sets no typography ships no element at all. */}
        {textRules && <style dangerouslySetInnerHTML={{ __html: textRules }} />}
        {/* Amber outside the box is margin, green inside it is padding — the
            browser's own colours, over the block they belong to. Four numbers
            in a panel do not say which edge moved. */}
        <SpacingGuide on={selected} el={box} />
        <div ref={boxRef} className={blockClass(block)} style={blockCssAt(block, theme, device)}>
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
          ) : block.type === "global" ? (
            <LinkedBlock block={block} theme={theme} device={device} />
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
/**
 * What a linked block offers instead of controls.
 *
 * Three facts and two decisions: what it is linked to, that editing it reaches
 * every page, and — if this page needs to differ — that unlinking is how, and
 * what unlinking costs.
 */
function LinkedPanel({
  name,
  canEdit,
  onEdit,
  onUnlink,
  onDelete,
}: {
  name: string | null;
  canEdit: boolean;
  onEdit: () => void;
  onUnlink: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <strong className="font-display text-sm">Linked block</strong>
        <p className="mt-0.5 text-[0.68rem] text-muted">
          {name ? (
            <>
              This page shows <strong className="text-fg">{name}</strong>, which is kept in
              Templates.
            </>
          ) : (
            "This points at a design that is no longer here, so it shows nothing on the page."
          )}
        </p>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary-hover"
        >
          Edit this design
        </button>
      )}
      {canEdit && (
        <p className="text-[0.62rem] leading-snug text-muted">
          Editing changes it everywhere it is used, not only here.
        </p>
      )}

      <button
        type="button"
        onClick={onUnlink}
        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-fg hover:text-fg"
      >
        Unlink from this page
      </button>
      <p className="text-[0.62rem] leading-snug text-muted">
        Keeps what is here now as ordinary blocks this page owns, and stops
        receiving changes. Other pages are untouched.
      </p>

      <button
        type="button"
        onClick={onDelete}
        className="self-start rounded px-1 text-[0.66rem] text-muted hover:text-[#b3261e]"
      >
        Remove it from this page
      </button>
    </div>
  );
}

/**
 * A pointer, drawn as the design it points at.
 *
 * The same `Blocks` a visitor gets, so what is on the canvas is what the page
 * shows — and marked, because the one thing worse than not seeing a shared
 * block is not knowing a block is shared before you change it.
 *
 * Nothing inside is editable here. The page holds a pointer, and a pointer has
 * no typography; the design's own content is edited through the panel, which
 * is the only place a change can honestly say it reaches every page.
 */
function LinkedBlock({
  block,
  theme,
  device,
}: {
  block: Block;
  theme: BandTheme;
  device: Device;
}) {
  const globals = useContext(Globals);
  // A saved design can hold a Catalogue block like any other. Without this it
  // would preview as nothing here while drawing on the page.
  const store = useContext(CanvasStore);
  const id = typeof block.props.globalId === "string" ? block.props.globalId : "";
  const linked = globals.get(id);

  if (!linked) {
    // Either the design was deleted, or this canvas was given no index — the
    // nested editor does exactly that. Said plainly rather than drawn as an
    // empty block, because "nothing here" and "pointing at something gone" are
    // different problems with different fixes.
    return (
      <p
        className="rounded border border-dashed px-3 py-4 text-center text-xs"
        style={{ color: theme.muted, borderColor: theme.rule }}
      >
        {id
          ? "Linked to a design that is no longer here — it shows nothing on the page."
          : "Linked to nothing."}
      </p>
    );
  }

  return (
    <div className="relative">
      <span className="absolute -top-2 right-0 z-10 rounded bg-primary/90 px-1.5 text-[0.6rem] leading-4 text-primary-fg">
        ⛓ {linked.name}
      </span>
      <div className="pointer-events-none">
        <Blocks blocks={linked.blocks} theme={theme} at={device} store={store} />
      </div>
    </div>
  );
}

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
  const store = useContext(CanvasStore);
  const key = block.type === "heading" || block.type === "button" ? "text" : null;
  if (!key) return <BlockBody block={block} theme={theme} at={device} store={store} />;
  if (!selected) return <BlockBody block={block} theme={theme} at={device} store={store} />;
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
      <BlockBody block={block} theme={theme} at={device} store={store} />
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
  // A grid's cells have no edges of their own, so with a track list wider than
  // the columns that fill it there is nothing on screen saying where one track
  // ends and the next begins. Drawn here and nowhere else: it is scaffolding
  // for the person building the page, and a dashed box on the live page would
  // be a border nobody asked for.
  const grid = rowIsGrid(block, device);
  const onColumnContext = useContext(ColumnMenu);
  return (
    <div style={layout.container}>
      {columns.map((col, c) => {
        const colId = `${block.id}#${c}`;
        return (
        <div
          key={c}
          // Named the way a block is. A column is selectable, right-clickable
          // and draggable-into, and until now it was none of those things to
          // anything looking at the DOM.
          data-column={colId}
          onClick={(e) => {
            // Only when the click was not on a block inside it. A column is the
            // thing behind its contents, so it is what a click on the space
            // around them means.
            e.stopPropagation();
            onSelect(colId);
          }}
          onContextMenu={(e) => {
            // Stopped, or it reaches the row's own handler and the menu that
            // opens is the container's — so "Duplicate" copies the whole thing
            // when a column was what was asked for.
            e.stopPropagation();
            onSelect(colId);
            onColumnContext?.(e, block, c);
          }}
          className={
            selectedId === colId
              ? "outline outline-2 outline-offset-1 outline-[var(--primary)]"
              : grid
                ? // The dashed box reads as decoration, so it cannot be the only
                  // cue — on a grid it REPLACED the hover outline, in the mode
                  // with the most columns to aim at. It recolours instead.
                  "outline outline-1 outline-dashed outline-[var(--border)] hover:outline-[var(--primary)]"
                : "hover:outline hover:outline-1 hover:outline-offset-1 hover:outline-[var(--border)]"
          }
          style={{
            borderColor: theme.rule,
            ...layout.columns[c],
            ...columnCss(block, c, theme, device),
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

// --- card templates ---------------------------------------------------------

/**
 * Two finished looks for a Cards block, and a way to keep neither.
 *
 * Drawn rather than described: "Tiles" and "Rows" are words that mean nothing
 * until you have seen both, and a preview is what turns a chooser into
 * something you press without reading first. Not a modal on purpose — a
 * chooser you have to open is one nobody opens, and this sits above the
 * settings it is a shortcut for, so the connection is visible.
 *
 * A template only ever writes presentation, so there is no confirmation step:
 * the copy on the cards cannot be what it changes.
 */
function CardTemplates({
  block,
  device,
  canTakeApart,
  onTakeApart,
  onApply,
}: {
  block: Block;
  device: Device;
  canTakeApart: boolean;
  onTakeApart: () => void;
  onApply: (id: string) => void;
}) {
  // Which one you are on, rather than a third button that does nothing. A
  // block someone has adjusted by hand matches neither, and saying so is
  // information — "Custom" answers a question the panel could not answer at all.
  const current = matchedCardTemplate(block);
  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
      <span className="flex items-baseline justify-between gap-2 text-[0.7rem] font-semibold text-fg">
        Layout
        <span className="font-normal text-[0.6rem] text-muted">
          {current ? CARD_TEMPLATES.find((t) => t.id === current)?.label : "Custom"}
        </span>
      </span>
      {/* A full-width chooser with previews reads like it applies to the width
          on screen. Only Across differs per device; the rest is one decision
          for the block, and this is where that is said rather than found out. */}
      {device !== "desktop" && (
        <span className="text-[0.6rem] leading-tight text-muted">Applies at every width.</span>
      )}
      <div className="flex gap-1.5">
        {CARD_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.hint}
            onClick={() => onApply(t.id)}
            aria-pressed={current === t.id}
            className={`flex flex-1 flex-col items-center gap-1 rounded-md border p-1.5 text-[0.6rem] leading-tight hover:border-primary hover:text-fg ${
              current === t.id
                ? "border-primary bg-primary/8 text-fg"
                : "border-border text-muted"
            }`}
          >
            <TemplatePreview id={t.id} />
            <span className="text-center">{t.label}</span>
          </button>
        ))}
      </div>
      <TakeApart block={block} enabled={canTakeApart} onConfirm={onTakeApart} />
    </div>
  );
}

/**
 * The way out of a preset.
 *
 * A layout above is a bundle of settings, and every one of them stays editable
 * — but the PARTS of a card are fixed at an icon, a title and a body. Nobody
 * can put a button under the third card and not the others, which is what
 * "these are templates, not fixed design" was asking for.
 *
 * So: the same design, rebuilt out of a container and real blocks. Everything
 * becomes droppable, removable and reorderable, at the cost of the layout
 * chooser and the one-place-edits-all convenience above.
 *
 * It does not go back. A container cannot be gathered into a cards block
 * without guessing which blocks were meant to be one card — so this asks first,
 * and lists what the conversion cannot carry before it runs rather than after.
 */
function TakeApart({
  block,
  enabled,
  onConfirm,
}: {
  block: Block;
  enabled: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const warnings = explodeWarnings(block);

  if (!enabled) {
    // Silent rather than a disabled button with a tooltip: inside a column this
    // is not a thing you are being denied, it is a thing that does not apply.
    return null;
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mt-0.5 self-start text-[0.62rem] text-muted underline decoration-dotted underline-offset-2 hover:text-fg"
      >
        Take apart into blocks…
      </button>
    );
  }

  return (
    <div className="mt-0.5 flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2 text-[0.62rem] leading-snug">
      <span className="text-fg">
        Rebuilds these cards as a container with one column each, so every icon,
        heading and paragraph becomes a block you can move, restyle or delete —
        and you can add anything else beside them.
      </span>
      <span className="text-muted">You cannot turn them back into cards.</span>
      {warnings.length > 0 && (
        <ul className="flex list-disc flex-col gap-0.5 pl-3.5 text-muted">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded bg-primary px-2 py-1 text-[0.62rem] font-medium text-primary-fg hover:bg-primary-hover"
        >
          Take apart
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="rounded px-2 py-1 text-[0.62rem] text-muted hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TemplatePreview({ id }: { id: string }) {
  const box = "h-8 w-full rounded-sm bg-surface-2 p-1";
  if (id === "tiles")
    return (
      <span aria-hidden className={`${box} grid grid-cols-2 gap-0.5`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="rounded-[2px] border border-border" />
        ))}
      </span>
    );
  if (id === "rows")
    return (
      <span aria-hidden className={`${box} flex flex-col justify-between`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`flex items-center gap-1 ${i ? "border-t border-border pt-0.5" : ""}`}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
            <span className="h-0.5 flex-1 rounded-full bg-border" />
          </span>
        ))}
      </span>
    );
  return (
    <span aria-hidden className={`${box} grid place-content-center`}>
      —
    </span>
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
  // Only style controls have a wider device to inherit from; a heading's text
  // is the same words at every width.
  const at = deviceOf(control, device);
  const key = control.key.split(".")[0];
  const set = at !== "desktop" && hasOverride(block, at, key, scopeOf(control));

  // A dotted key is stored whole: an override is `{ background: {...} }`, one
  // top-level key, so `clearAt("background")` takes the image, the overlay and
  // the gradient stops along with the colour. Not because a sparse background
  // is inexpressible — the colour field's own ✕ below clears exactly itself by
  // writing null through the path — but because the per-device patch has no
  // room to say "this half is set and that half is not". Twelve fields on a
  // block's Advanced tab and ten on a column, each promising to reset only
  // itself and every one of them resetting all the others, is how someone
  // loses a background image by tidying up a colour. The chip names the group
  // it actually clears, and its accessible name still names the field it sits
  // beside — otherwise seven chips in one panel share one label and one action.
  const grouped = control.key.includes(".");
  const clears = grouped ? key[0].toUpperCase() + key.slice(1) : control.label;

  // `deviceOf` sends a control that holds no per-device value to desktop
  // whatever the tab says, so typing into Text on the Mobile tab edits the one
  // value there is. The `set` chip cannot say so — it only appears where there
  // IS an override — and silence reads as "this width forked". Said rather
  // than disabled, and left shared rather than made per-device: nearly all of
  // what lays a block out is per-device already (see `responsive: true`), and
  // most of what is left is content and behaviour, where a card's words being
  // the same words at every width is the right answer and hiding the field on
  // the Mobile tab would only send people back to Desktop to type. "Nearly"
  // and "most" on purpose — a button's `fullWidth` is layout and is not
  // responsive. The chip tells the truth about it either way; this comment
  // used to claim there were no such controls.
  const shared = device !== "desktop" && at === "desktop";

  // The six keys a narrow width stopped inheriting. Clearing one does NOT give
  // the width above back — nothing is emitted at all and Site settings is what
  // is left standing — so the chip must not offer "the desktop value again",
  // and a field that reads blank here has not lost anything.
  //
  // Mobile is the exception to the exception: it does layer on tablet, so a
  // tablet value is a real fallback and the ordinary wording is correct.
  const siteDefaulted =
    scopeOf(control) === "style" && (SITE_DEFAULTED_KEYS as readonly string[]).includes(key);
  const fallsToSite =
    at !== "desktop" && siteDefaulted && !(at === "mobile" && hasOverride(block, "tablet", key));

  // Unset is what `baseStyle` gives the key, and it is what the emitter treats
  // as "say nothing" — so these three are the whole of "the laptop set this".
  const desktopValue = readControl(block, control, "desktop");
  const desktopSet = desktopValue !== null && desktopValue !== "" && desktopValue !== "none";

  // The Desktop tab's half of the same fact. `fallsToSite` cannot say it —
  // it is false at desktop by construction — so the one tab where the value is
  // actually typed said nothing about where it stops, under a device switch
  // whose tooltip reads "Desktop — every width". Only when nothing narrower has
  // been set: a block migration 0042 pinned has a value at every width and this
  // would be noise.
  const desktopStops =
    device === "desktop" &&
    siteDefaulted &&
    desktopSet &&
    !hasOverride(block, "tablet", key) &&
    !hasOverride(block, "mobile", key);

  // Said where the number is, not in a console nobody opens.
  //
  // "stops at 1023px and narrower", not "stops above 1023px": the rule is
  // `@media (width > 1023px)`, so it APPLIES above 1023 and stops at 1023 and
  // below. "Stops above X" reads as the opposite — the tree line stops above
  // 2000m — and this is the one sentence about the boundary a person reads.
  const notice =
    "key" in control && control.key === "padding"
      ? mobilePaddingNotice(block)
      : fallsToSite && !set && desktopSet
        ? `The desktop value stops at ${DEVICE_MAX.tablet}px and narrower. Site settings → Typography decides this at ${at} width — type here to choose your own.`
        : desktopStops
          ? `This applies above ${DEVICE_MAX.tablet}px only. At ${DEVICE_MAX.tablet}px and narrower, Site settings → Typography decides it until you set a value on the Tablet or Mobile tab.`
          : null;
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
          title={
            fallsToSite
              ? `Set for ${at}. Click to follow Site settings → Typography here again.`
              : grouped
                ? `${clears} is set for ${at}. Click to use the ${at === "mobile" ? "tablet" : "desktop"} ${key} again — colour, image, overlay and gradient go together, because they are stored as one.`
                : `Set for ${at}. Click to use the ${at === "mobile" ? "tablet" : "desktop"} value again.`
          }
          className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[0.58rem] leading-4 text-primary hover:bg-primary/25"
          aria-label={grouped ? `Reset ${clears} for ${at}, from ${control.label}` : `Reset ${clears} for ${at}`}
        >
          {at} ✕
        </button>
      )}
      {shared && (
        <span
          title="One value for the block. Editing it here changes it at every width."
          className="shrink-0 rounded-full bg-border px-1.5 text-[0.58rem] leading-4 text-muted"
        >
          every width
        </span>
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
              {/* `setColumnCount` moves the CONTENT and drops the column's own
                  styling — background, padding, order, align — to match what
                  `normalizeBlocks` keeps on a reload. The old wording said
                  "nothing is deleted", which was true of the blocks and not of
                  the column they sat in. */}
              Fewer columns moves the blocks in them into the last one. The dropped
              column&rsquo;s own background and spacing go with it.
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
      // A column given its own Width wins — `rowLayout` applies it after the
      // row's share, deliberately. So the field for that column is showing a
      // number nothing draws, and typing in it changes nothing on screen. It
      // says whose width it is and stops accepting input, the same way the
      // stacked row below says why every field reads 100.
      const owned = widths.map((_, i) => columnOwnWidth(block, i, at));
      return (
        <div className="flex flex-col gap-1.5">
          {label}
          {/* One field per column, because "column width for each" is the thing
              being asked for. Setting one takes the difference from the others
              in proportion, so the row always adds up to a row. */}
          <div className="flex flex-wrap gap-1.5">
            {widths.map((w, i) => (
              <label key={i} className="flex flex-1 basis-16 flex-col gap-0.5">
                <span className="text-[0.62rem] text-muted">
                  Col {i + 1}
                  {owned[i] ? ` · ${owned[i]}` : ""}
                </span>
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
                  disabled={owned[i] !== null}
                  title={owned[i] ? `Column ${i + 1} sets its own width (${owned[i]}). Clear it there to use the row's share.` : undefined}
                  className={`${input} px-1.5 text-center tabular-nums ${owned[i] ? "opacity-50" : ""}`}
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
            {/* Both, not one or the other. They were a ternary with the stack
                first, so a stacked row with a column that owns its width said
                "each is full width" — and `rowLayout` spreads the column's own
                layout last, so that column draws its 220px stacked as well.
                The sentence that explains it was in the branch that could not
                run, beside a field disabled with no reason given. */}
            {(stacksAt(block, at) || owned.some(Boolean)) && (
            <span className="text-[0.62rem] leading-tight text-muted">
              {stacksAt(block, at) &&
                (owned.some(Boolean)
                  ? "Stacked here — full width, except the columns below. "
                  : "Stacked here — each is full width. Type one to override.")}
              {owned.some(Boolean) &&
                `${owned.map((o, i) => (o ? `Col ${i + 1}` : null)).filter(Boolean).join(", ")}: own width, set on the column. The row’s share does not reach it.`}
            </span>
            )}
          </div>
        </div>
      );
    }

    case "number": {
      // Slider AND a number you can type. A slider alone cannot reliably hit 15,
      // and a number alone cannot be explored.
      //
      // They do not share a step, and that was the bug: one `step` drove both,
      // so a gap whose slider moves in fours also moved in fours from the
      // keyboard, and 17px was a value the panel simply would not produce. The
      // slider keeps its coarse detents — that is what makes it draggable — and
      // the typed field goes to the smallest unit the setting has. A fractional
      // step is already the finest it gets, so line height stays at 0.05 rather
      // than becoming a control that steps from 1.5 to 2.5.
      const typedStep = control.step >= 1 ? 1 : control.step;
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
            step={typedStep}
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
    }

    case "position":
      return row(
        <PositionPicker
          value={typeof value === "string" ? value : "center center"}
          onChange={onChange}
        />,
        { stack: true },
      );

    case "icon": {
      const picked =
        value && typeof value === "object" && "d" in (value as Record<string, unknown>)
          ? (value as { v: string; d: string })
          : null;
      return row(
        <IconPicker value={picked} onPick={(icon) => onChange(icon)} onClear={() => onChange(null)} />,
        { stack: true },
      );
    }

    case "datetime":
      // The browser's own picker. A text field asking for "YYYY-MM-DD HH:MM"
      // is a format somebody has to get right by hand, and gets wrong.
      return row(
        <input
          type="datetime-local"
          aria-label={control.label}
          value={typeof value === "string" ? value.replace(" ", "T").slice(0, 16) : ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${input} [color-scheme:light]`}
        />,
      );

    case "color":
      return row(<ColorControl label={control.label} value={value} onChange={onChange} />);

    case "dim": {
      // A value that has never been set starts LINKED. It is arriving from a
      // control that used to be one number, and typing into one box and
      // getting three zeroes you did not ask for is not what "add per-side"
      // was meant to mean. Unlink for four.
      const d = (value ?? { t: 0, r: 0, b: 0, l: 0, u: "px", link: true }) as Record<string, number | string | boolean>;
      const SIDE_LABEL = { t: "Top", r: "Right", b: "Bottom", l: "Left" } as const;
      return (
        <div className="flex flex-col gap-1">
          {label}
          <div className="flex items-center gap-1">
            {(["t", "r", "b", "l"] as const).map((side) => (
              // Labelled. Four identical boxes in a row is a guess about which
              // one is the top, and the guess is wrong a quarter of the time.
              <span key={side} className="flex w-full flex-col items-center gap-0.5">
              <input
                type="number"
                aria-label={`${control.label} ${SIDE_LABEL[side].toLowerCase()}`}
                title={SIDE_LABEL[side]}
                className="w-full rounded border border-border bg-surface px-1 py-1 text-center text-xs"
                value={Number(d[side] ?? 0)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange(d.link ? { ...d, t: n, r: n, b: n, l: n } : { ...d, [side]: n });
                }}
              />
              <span className="text-[0.6rem] text-muted">{SIDE_LABEL[side]}</span>
              </span>
            ))}
            <button
              type="button"
              aria-label="Link sides"
              title="Link all four sides"
              onClick={() => onChange({ ...d, link: !d.link })}
              className={`mb-4 rounded px-1 text-xs ${d.link ? "text-fg" : "text-muted"}`}
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
                // The same picker every other image on this screen uses, rather
                // than a box to paste a path into. A card's picture is a file in
                // the library like any other; typing its path is how you get a
                // broken image and no idea which character is wrong.
                f.kind === "image" ? (
                  <ImageControl
                    key={f.key}
                    label={<span className="text-[0.7rem] text-muted">{f.label}</span>}
                    value={row[f.key] ?? ""}
                    onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, [f.key]: String(v) } : r)))}
                  />
                ) : f.kind === "textarea" ? (
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
