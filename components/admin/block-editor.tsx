"use client";

import { useMemo, useRef, useState } from "react";
import { BlockBody } from "@/components/page/blocks";
import { RichText } from "@/components/editor/rich-text";
import {
  BLOCK_LABEL,
  PALETTE,
  controlsFor,
  isGroup,
  readControl,
  writeControl,
  type Control,
} from "@/lib/block-controls";
import {
  addTarget,
  blockRendersNothing,
  duplicateBlock,
  edgeIndex,
  findBlock,
  insertBlock,
  moveBlock,
  newBlock,
  removeBlock,
  updateBlock,
  ROW_STRUCTURES,
  type Block,
  type BlockType,
  type DropTarget,
} from "@/lib/blocks";
import { blockWrapperCss } from "@/lib/block-style";
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
type DragPayload = { kind: "new"; type: BlockType } | { kind: "move"; id: string };

const input =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-fg";

/** Uploads a file and returns the stored path, or an error. */
export type UploadImage = (file: File) => Promise<{ path?: string; error?: string }>;

export function BlockEditor({
  blocks,
  theme,
  title,
  onChange,
  onClose,
  uploadImage,
}: {
  blocks: Block[];
  theme: BandTheme;
  title: string;
  onChange: (next: Block[]) => void;
  onClose: () => void;
  /** Without this an image block can only take a pasted URL. */
  uploadImage?: UploadImage;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  const drag = useRef<DragPayload | null>(null);
  const [dropAt, setDropAt] = useState<string | null>(null);

  const selected = useMemo(
    () => (selectedId ? findBlock(blocks, selectedId)?.block ?? null : null),
    [blocks, selectedId],
  );

  function patch(id: string, next: Block) {
    onChange(updateBlock(blocks, id, () => next));
  }

  function drop(target: DropTarget) {
    const payload = drag.current;
    drag.current = null;
    setDropAt(null);
    if (!payload) return;
    if (payload.kind === "new") {
      const block = newBlock(payload.type);
      // insertBlock refuses a row inside a column; say so rather than letting
      // the click appear to do nothing.
      if (block.type === "row" && target.zone === "column") return;
      onChange(insertBlock(blocks, block, target));
      setSelectedId(block.id);
      setTab("content");
    } else {
      onChange(moveBlock(blocks, payload.id, target));
    }
  }

  function add(type: BlockType) {
    const block = newBlock(type);
    onChange(insertBlock(blocks, block, addTarget(blocks, selectedId, type)));
    setSelectedId(block.id);
    setTab("content");
  }

  const tabs = selected ? controlsFor(selected) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-2">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <strong className="font-display text-sm">Builder</strong>
        <span className="text-sm text-muted">{title}</span>
        <span className="ml-auto text-xs text-muted">
          {blocks.length === 0 ? "Empty" : `${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          Done
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[190px_1fr_270px]">
        {/* Palette */}
        <aside className="flex flex-col gap-2 overflow-y-auto border-r border-border bg-surface p-3">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted">
            Drag or click to add
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTE.map((p) => (
              <button
                key={p.type}
                type="button"
                draggable
                onDragStart={(e) => {
                  drag.current = { kind: "new", type: p.type };
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/plain", p.type);
                }}
                onDragEnd={() => {
                  drag.current = null;
                  setDropAt(null);
                }}
                onClick={() => add(p.type)}
                className="cursor-grab rounded-lg border border-border bg-surface-2 px-2 py-2.5 text-xs hover:border-fg"
              >
                {p.label}
              </button>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <div className="min-w-0 overflow-y-auto p-6" style={{ background: theme.bg }}>
          <div className="mx-auto w-full max-w-[900px]">
            <Zone
              blocks={blocks}
              theme={theme}
              zoneId="root"
              selectedId={selectedId}
              dropAt={dropAt}
              setDropAt={setDropAt}
              onSelect={(id) => {
                setSelectedId(id);
                setTab("content");
              }}
              onDrop={drop}
              onDragStart={(id) => (drag.current = { kind: "move", id })}
              onPatch={patch}
              target={(index) => ({ zone: "root", index })}
            />
            {blocks.length === 0 && (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ color: theme.muted, borderColor: theme.rule }}>
                Drag a block here, or click one on the left.
              </p>
            )}
          </div>
        </div>

        {/* Inspector */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-l border-border bg-surface">
          {!selected || !tabs ? (
            <p className="p-4 text-sm text-muted">Select a block to edit it.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <strong className="font-display text-sm">{BLOCK_LABEL[selected.type]}</strong>
                <div className="ml-auto flex gap-1">
                  <IconBtn label="Duplicate" onClick={() => onChange(duplicateBlock(blocks, selected.id))}>
                    ⧉
                  </IconBtn>
                  <IconBtn
                    label="Delete"
                    onClick={() => {
                      onChange(removeBlock(blocks, selected.id));
                      setSelectedId(null);
                    }}
                  >
                    ✕
                  </IconBtn>
                </div>
              </div>
              <div className="flex border-b border-border">
                {(["content", "style", "advanced"] as Tab[]).map((t) => (
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
              <div className="flex flex-col gap-3 overflow-y-auto p-3">
                {(tab === "content" ? tabs.content : tab === "style" ? tabs.style : tabs.advanced).map((c, i) =>
                  isGroup(c) ? (
                    <div key={`g${i}`} className="mt-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted">
                      {c.label}
                    </div>
                  ) : (
                    <ControlField
                      key={`${c.kind}:${c.key}`}
                      control={c}
                      block={selected}
                      uploadImage={uploadImage}
                      onChange={(v) => patch(selected.id, writeControl(selected, c, v))}
                    />
                  ),
                )}
                {tab === "style" && tabs.style.length === 0 && (
                  <p className="text-xs text-muted">
                    Nothing to style here — spacing and background are under Advanced.
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
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
  onDrop,
  onDragStart,
  onPatch,
  target,
}: {
  blocks: Block[];
  theme: BandTheme;
  zoneId: string;
  selectedId: string | null;
  dropAt: string | null;
  setDropAt: (v: string | null) => void;
  onSelect: (id: string) => void;
  onDrop: (t: DropTarget) => void;
  onDragStart: (id: string) => void;
  onPatch: (id: string, next: Block) => void;
  target: (index: number) => DropTarget;
}) {
  return (
    <div
      data-zone={zoneId}
      className="flex min-h-[40px] flex-col"
      onDragOver={(e) => {
        // Only claim the drop when it is not over a child; the child's own
        // handler stops propagation and decides above-or-below itself.
        e.preventDefault();
        if (e.currentTarget === e.target) setDropAt(`${zoneId}:${blocks.length}`);
      }}
      onDrop={(e) => {
        if (e.currentTarget !== e.target) return;
        e.preventDefault();
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
          onDrop={onDrop}
          onDragStart={onDragStart}
          onPatch={onPatch}
          target={target}
        />
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
  onDrop,
  onDragStart,
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
  onDrop: (t: DropTarget) => void;
  onDragStart: (id: string) => void;
  onPatch: (id: string, next: Block) => void;
  target: (index: number) => DropTarget;
}) {
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
    >
      {dropAt === `${zoneId}:${index}` && <DropLine />}

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
          }}
          onDragEnd={() => setDropAt(null)}
          title={`Move ${BLOCK_LABEL[block.type]}`}
          className={`absolute -left-2 -top-2 z-10 cursor-grab rounded bg-primary px-1.5 text-[0.6rem] leading-4 text-primary-fg ${
            selected ? "" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          ⠿ {BLOCK_LABEL[block.type]}
        </span>

        <div style={blockWrapperCss(block, theme)}>
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
              onPatch={onPatch}
            />
          ) : empty ? (
            <p className="rounded border border-dashed px-3 py-4 text-center text-xs" style={{ color: theme.muted, borderColor: theme.rule }}>
              Empty {BLOCK_LABEL[block.type].toLowerCase()} — it will not show on the page until you fill it in.
            </p>
          ) : (
            <Editable block={block} theme={theme} onPatch={onPatch} />
          )}
        </div>
      </div>

      {dropAt === `${zoneId}:${index + 1}` && <DropLine />}
    </div>
  );
}

/**
 * Type straight into the canvas for the fields that are plain text.
 *
 * The value is written back on blur rather than on every keystroke: a state
 * change during typing re-renders the node and the caret jumps to the start,
 * which is exactly what made this feel broken in the prototype. Rich text stays
 * in the panel, where the editor owns its own selection model.
 */
function Editable({
  block,
  theme,
  onPatch,
}: {
  block: Block;
  theme: BandTheme;
  onPatch: (id: string, next: Block) => void;
}) {
  const key = block.type === "heading" ? "text" : block.type === "button" ? "text" : null;
  if (!key) return <BlockBody block={block} theme={theme} />;
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      data-edit={key}
      onBlur={(e) => {
        const next = e.currentTarget.textContent ?? "";
        if (next !== block.props[key]) {
          onPatch(block.id, { ...block, props: { ...block.props, [key]: next } });
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="outline-none"
    >
      <BlockBody block={block} theme={theme} />
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
  onPatch,
}: {
  block: Block;
  theme: BandTheme;
  selectedId: string | null;
  dropAt: string | null;
  setDropAt: (v: string | null) => void;
  onSelect: (id: string) => void;
  onDrop: (t: DropTarget) => void;
  onDragStart: (id: string) => void;
  onPatch: (id: string, next: Block) => void;
}) {
  const structure = (String(block.props.structure ?? "1-1") in ROW_STRUCTURES
    ? String(block.props.structure)
    : "1-1") as keyof typeof ROW_STRUCTURES;
  const widths = ROW_STRUCTURES[structure];
  const columns = block.columns ?? [];
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: widths.map((w) => `${w}fr`).join(" "), gap: `${Number(block.props.gap ?? 24)}px` }}
    >
      {columns.map((col, c) => (
        <div key={c} className="rounded border border-dashed p-1.5" style={{ borderColor: theme.rule }}>
          <Zone
            blocks={col}
            theme={theme}
            zoneId={`${block.id}:${c}`}
            selectedId={selectedId}
            dropAt={dropAt}
            setDropAt={setDropAt}
            onSelect={onSelect}
            onDrop={onDrop}
            onDragStart={onDragStart}
            onPatch={onPatch}
            target={(index) => ({ zone: "column", rowId: block.id, column: c, index })}
          />
          {col.length === 0 && (
            <p className="py-3 text-center text-[0.68rem]" style={{ color: theme.muted }}>
              Drop here
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function DropLine() {
  return <div data-dropline className="my-0.5 h-0.5 rounded bg-primary" />;
}

// --- one control ------------------------------------------------------------

function ControlField({
  control,
  block,
  onChange,
  uploadImage,
}: {
  control: Control;
  block: Block;
  onChange: (v: unknown) => void;
  uploadImage?: UploadImage;
}) {
  if (isGroup(control)) return null;
  const value = readControl(block, control);
  const label = (
    <span className="flex items-baseline justify-between gap-2 text-xs font-medium">
      {control.label}
      {control.hint && <span className="text-[0.66rem] font-normal text-muted">{control.hint}</span>}
    </span>
  );

  switch (control.kind) {
    case "text":
      return (
        <label className="flex flex-col gap-1">
          {label}
          <input
            className={input}
            value={typeof value === "string" ? value : ""}
            placeholder={control.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );

    case "image":
      return (
        <ImageControl
          label={label}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          uploadImage={uploadImage}
        />
      );

    case "textarea":
      return (
        <label className="flex flex-col gap-1">
          {label}
          <textarea
            className={`${input} ${control.mono ? "font-mono text-[0.72rem]" : ""}`}
            rows={control.rows ?? 3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );

    case "richtext":
      return (
        <div className="flex flex-col gap-1">
          {label}
          <RichText value={typeof value === "string" ? value : ""} onChange={onChange} />
        </div>
      );

    case "select":
      return (
        <label className="flex flex-col gap-1">
          {label}
          <select className={input} value={String(value ?? "")} onChange={(e) => onChange(coerce(e.target.value))}>
            {control.options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      );

    case "toggle":
      return (
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          {control.label}
        </label>
      );

    case "number":
      return (
        <label className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between text-xs font-medium">
            {control.label}
            <span className="text-[0.66rem] text-muted">
              {value === null || value === undefined ? "theme" : `${value}${control.unit ?? ""}`}
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              className="flex-1"
              min={control.min}
              max={control.max}
              step={control.step}
              value={typeof value === "number" ? value : control.min}
              onChange={(e) => onChange(Number(e.target.value))}
            />
            {/* Clearing is how a value goes back to inheriting from the band,
                so it has to be reachable — not only settable. */}
            <button
              type="button"
              title="Use the theme's value"
              onClick={() => onChange(null)}
              className="rounded px-1 text-[0.66rem] text-muted hover:text-fg"
            >
              reset
            </button>
          </div>
        </label>
      );

    case "color":
      return (
        <label className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between text-xs font-medium">
            {control.label}
            <span className="text-[0.66rem] text-muted">{typeof value === "string" ? value : "theme"}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              className="h-8 w-full rounded border border-border bg-surface"
              value={typeof value === "string" ? value : "#000000"}
              onChange={(e) => onChange(e.target.value)}
            />
            <button
              type="button"
              title="Follow the section's band"
              onClick={() => onChange(null)}
              className="rounded px-1 text-[0.66rem] text-muted hover:text-fg"
            >
              reset
            </button>
          </div>
        </label>
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
  uploadImage,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: unknown) => void;
  uploadImage?: UploadImage;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = imageSrc(value);

  async function pick(file: File | undefined) {
    if (!file || !uploadImage) return;
    setBusy(true);
    setError(null);
    const res = await uploadImage(file);
    setBusy(false);
    if (res.error || !res.path) setError(res.error ?? "Upload failed.");
    else onChange(res.path);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
      )}
      {uploadImage && (
        <label className="w-fit cursor-pointer rounded-full border border-border px-3 py-1 text-xs hover:border-fg">
          {busy ? "Uploading…" : src ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void pick(f);
            }}
          />
        </label>
      )}
      <input
        className={input}
        value={value}
        placeholder="…or paste a URL"
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <span className="text-xs text-primary">{error}</span>}
    </div>
  );
}
