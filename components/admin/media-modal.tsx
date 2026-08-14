"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeMediaAction } from "@/app/admin/media/actions";
import type { MediaKind } from "@/lib/media-library";

export type PickedMedia = {
  id: string;
  path: string;
  name: string;
  alt: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string | null;
  createdAt?: string;
};

/**
 * One place to choose a file, whether it exists yet or not.
 *
 * Upload and library used to be two controls sitting next to each other, which
 * asks the wrong question first: nobody thinks "am I uploading or reusing", they
 * think "I want this picture there". So both live in one window — the library is
 * what opens, because after the first week most of what anyone wants is already
 * in it, and uploading is a tab away rather than a different control.
 *
 * The name and description are edited HERE, at the moment someone is looking at
 * the picture and can see what is in it. A separate admin page for it would be
 * a page nobody visits.
 */

const TABS = [
  { key: "library", label: "Media library" },
  { key: "upload", label: "Upload files" },
] as const;

export function MediaModal({
  kind,
  open,
  onClose,
  onPick,
}: {
  kind: MediaKind;
  open: boolean;
  onClose: () => void;
  onPick: (item: PickedMedia) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("library");
  const [items, setItems] = useState<PickedMedia[] | null>(null);
  const [selected, setSelected] = useState<PickedMedia | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (search: string) => {
      try {
        const res = await fetch(`/api/media/library?kind=${kind}&q=${encodeURIComponent(search)}`);
        const data = await res.json();
        setItems(data.items ?? []);
        setError(null);
      } catch {
        setError("Could not load your files.");
      }
    },
    [kind],
  );

  // Debounced, because a library of three hundred files should not be three
  // hundred queries for someone typing a filename.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(q), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, q, load]);

  // Escape closes it. A modal that can only be dismissed by finding the small
  // button is a modal people learn to dread.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Straight into the grid and selected, so an upload ends where a person
  // expects: looking at the thing they just added. On a batch that means the
  // last one to land, which is the one still under the cursor.
  const took = (item: PickedMedia) => {
    setItems((old) => [item, ...(old ?? [])]);
    setSelected(item);
    setTab("library");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[min(90vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={
                  tab === t.key
                    ? "rounded-full bg-fg px-4 py-1.5 text-sm text-bg"
                    : "rounded-full px-4 py-1.5 text-sm text-muted hover:text-fg"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-border px-3 py-1 text-sm text-muted hover:text-fg"
          >
            Close
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {tab === "upload" ? (
              <Upload kind={kind} onItem={took} />
            ) : (
              <Library
                kind={kind}
                q={q}
                setQ={setQ}
                items={items}
                error={error}
                selected={selected}
                onSelect={setSelected}
                onItem={took}
              />
            )}
          </div>

          <Details
            item={selected}
            neighbours={items ?? []}
            onMove={(step) => {
              const list = items ?? [];
              const at = list.findIndex((i) => i.id === selected?.id);
              const next = list[at + step];
              if (next) setSelected(next);
            }}
            onSaved={(patched) => {
              setSelected(patched);
              setItems((old) => old?.map((i) => (i.id === patched.id ? patched : i)) ?? null);
            }}
            onUse={() => selected && onPick(selected)}
          />
        </div>
      </div>
    </div>
  );
}

function Grid({
  items,
  error,
  selectedId,
  onSelect,
}: {
  items: PickedMedia[] | null;
  error: string | null;
  selectedId: string | null;
  onSelect: (item: PickedMedia) => void;
}) {
  if (error) return <p className="p-5 text-sm text-primary">{error}</p>;
  if (items === null) return <p className="p-5 text-sm text-muted">Loading…</p>;
  if (items.length === 0) {
    return (
      <p className="p-5 text-sm text-muted">
        Nothing of this type yet. Use <b className="font-medium text-fg">Upload files</b> above.
      </p>
    );
  }
  return (
    <ul className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className={`flex w-full flex-col gap-1 rounded-xl border p-2 text-left transition-colors ${
              item.id === selectedId
                ? "border-primary ring-2 ring-primary/30"
                : "border-border hover:border-fg"
            }`}
          >
            <Thumb item={item} />
            <span className="truncate text-xs">{item.name}</span>
            <span className="truncate text-[11px] text-muted">
              {item.width && item.height ? `${item.width} × ${item.height}` : item.mime}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The one that is selected, and everything about it worth knowing or changing.
 *
 * Editing lives here rather than on its own page because this is the moment
 * someone is actually looking at the picture. Asked anywhere else, the honest
 * answer to "what is in this image" is "let me go and look".
 */
/** Exported for its own test: the pane is only reachable with a file chosen. */
export function Details({
  item,
  neighbours,
  onMove,
  onSaved,
  onUse,
}: {
  item: PickedMedia | null;
  neighbours: PickedMedia[];
  onMove: (step: -1 | 1) => void;
  onSaved: (item: PickedMedia) => void;
  onUse: () => void;
}) {
  const [name, setName] = useState("");
  const [alt, setAlt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(item?.name ?? "");
    setAlt(item?.alt ?? "");
    setSaved(false);
  }, [item]);

  if (!item) {
    return (
      <aside className="hidden w-80 shrink-0 border-l border-border p-5 text-sm text-muted lg:block">
        Pick a file to see its details.
      </aside>
    );
  }

  const isImage = item.mime.startsWith("image/");
  const index = neighbours.findIndex((i) => i.id === item.id);

  async function save() {
    if (!item) return;
    setSaving(true);
    const fd = new FormData();
    fd.append("id", item.id);
    fd.append("name", name);
    if (isImage) fd.append("alt", alt);
    const res = await describeMediaAction({}, fd);
    setSaving(false);
    if (!res.error) {
      setSaved(true);
      onSaved({ ...item, name: name.trim() || item.name, alt: isImage ? alt : item.alt });
    }
  }

  return (
    // Three bands, not one scrolling column: a heading, the details, and the
    // two buttons. `mt-auto` inside a scrolling box pins a thing to the end of
    // the CONTENT, not to the bottom of the panel — so on a tall picture with
    // a long URL, "Use this file" sat below the fold and the library looked
    // like it had no way to pick anything.
    <aside className="flex w-80 shrink-0 flex-col border-l border-border">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <span className="text-sm font-medium">File details</span>
        {/* Stepping through them beats going back to the grid: the question is
            almost always "is that the one I meant, or the next one". */}
        <span className="flex gap-1">
          <Step label="Previous file" disabled={index <= 0} onClick={() => onMove(-1)}>
            ‹
          </Step>
          <Step
            label="Next file"
            disabled={index < 0 || index >= neighbours.length - 1}
            onClick={() => onMove(1)}
          >
            ›
          </Step>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4">
      <Thumb item={item} whole />
      <dl className="flex flex-col gap-0.5 text-xs text-muted">
        <Fact label="File" value={item.path.split("/").pop() ?? item.path} />
        <Fact label="Type" value={item.mime} />
        {item.width && item.height ? (
          <Fact label="Dimensions" value={`${item.width} × ${item.height}`} />
        ) : null}
        {item.size > 0 ? (
          <Fact label="Weight" value={`${Math.max(1, Math.round(item.size / 1024))}KB`} />
        ) : null}
        {item.createdAt ? (
          <Fact label="Added" value={new Date(item.createdAt).toLocaleDateString()} />
        ) : null}
      </dl>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
        />
      </label>
      {isImage && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Alt text
          <input
            value={alt}
            onChange={(e) => {
              setAlt(e.target.value);
              setSaved(false);
            }}
            placeholder="What is in the picture"
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
          <span className="leading-relaxed">
            Read out to anyone who cannot see it, and read by Google in place of the picture. Leave
            it empty if it is decoration.
          </span>
        </label>
      )}

      {item.url && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          File URL
          <input
            readOnly
            value={item.url}
            onFocus={(e) => e.currentTarget.select()}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-fg"
          />
        </label>
      )}

      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-5 py-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full border border-border px-4 py-1.5 text-xs transition-colors hover:border-primary disabled:opacity-60"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save details"}
        </button>
        <button
          type="button"
          onClick={onUse}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          Use this file
        </button>
      </div>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0">{label}</dt>
      <dd className="truncate text-fg">{value}</dd>
    </div>
  );
}

function Step({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-6 w-6 rounded border border-border text-xs text-muted hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * The library, which can also take files.
 *
 * Uploading used to live on its own tab and nowhere else, so the answer to "add
 * a picture" was: open the window, notice a second tab, switch to it, upload,
 * come back. The grid is where people already are, so it takes a drop anywhere
 * on it and has a button of its own. The tab stays — it is the obvious place
 * when the library is empty and there is nothing to drop onto.
 */
function Library({
  kind,
  q,
  setQ,
  items,
  error,
  selected,
  onSelect,
  onItem,
}: {
  kind: MediaKind;
  q: string;
  setQ: (v: string) => void;
  items: PickedMedia[] | null;
  error: string | null;
  selected: PickedMedia | null;
  onSelect: (item: PickedMedia) => void;
  onItem: (item: PickedMedia) => void;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const up = useUploader(kind, onItem);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      // On the whole pane, not on the grid alone: an empty library has no tiles
      // to aim at, and neither does the gap under a short row.
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        // Only when the cursor actually leaves the pane. Moving over a child
        // fires dragleave on the parent, which made the overlay flicker.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void up.send(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your files"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={up.busy}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {up.label ?? "Upload"}
        </button>
        <FilePicker inputRef={input} accept={up.accept} onFiles={(f) => void up.send(f)} />
      </div>

      {up.error && (
        <p className="border-b border-border px-5 py-2 text-xs text-primary">{up.error}</p>
      )}

      <Grid items={items} error={error} selectedId={selected?.id ?? null} onSelect={onSelect} />

      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 m-3 grid place-content-center rounded-2xl border-2 border-dashed border-primary bg-surface/85 text-sm font-medium text-primary">
          Drop to upload
        </div>
      )}
    </div>
  );
}

/**
 * Uploading, however it was started.
 *
 * One implementation behind three ways in — the drop zone on the Upload tab, a
 * button on the library, and dropping files onto the library grid — because
 * the interesting part is not the button. It is that a batch is many requests:
 * the endpoint takes one file, and one request per file is what lets a single
 * bad file report its own error while the other eleven still land.
 *
 * Sequential, not parallel. Every image is resized on the server, and firing
 * twenty of those at once is how a shared box falls over — the one thing an
 * upload button must never do to the four other apps on it.
 */
/**
 * Exported so the Media page can upload too.
 *
 * That page listed every file in the store and had no way to add one — the only
 * uploader in the admin was inside this modal, which you can only reach from a
 * field that wants a picture. So the page whose whole job is "every file this
 * store holds" was the one place you could not put a file.
 */
export function useUploader(kind: MediaKind, onItem: (item: PickedMedia) => void) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accept = kind === "image" ? "image/*" : kind === "audio" ? "audio/*" : ".pdf,.txt,.docx";

  async function one(file: File): Promise<string | null> {
    // A fetch with no timeout can wait forever, and "Uploading…" that never
    // ends is the same as no feedback at all. Two minutes is generous for a
    // 100MB attachment on a slow line and far short of forever.
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 120_000);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/media/library", { method: "POST", body: fd, signal: stop.signal });
      // Not every failure answers in JSON — a proxy rejecting the size sends
      // HTML, and parsing that would throw where a message was wanted.
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.item) {
        return data.error ?? `${file.name}: upload failed (${res.status}). It may be too large.`;
      }
      onItem(data.item as PickedMedia);
      return null;
    } catch (e) {
      return e instanceof DOMException && e.name === "AbortError"
        ? `${file.name}: took too long and was stopped.`
        : `${file.name}: upload failed. Check the connection.`;
    } finally {
      clearTimeout(timer);
    }
  }

  async function send(files: FileList | File[] | null | undefined) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    setTotal(list.length);
    setDone(0);
    const failed: string[] = [];
    for (const f of list) {
      const err = await one(f);
      if (err) failed.push(err);
      setDone((n) => n + 1);
    }
    setBusy(false);
    setTotal(0);
    // Named, not counted. "3 failed" sends you hunting; the names say which.
    if (failed.length > 0) setError(failed.slice(0, 4).join(" · ") + (failed.length > 4 ? ` · and ${failed.length - 4} more` : ""));
  }

  const label = busy ? (total > 1 ? `Uploading ${done + 1} of ${total}…` : "Uploading…") : null;
  return { busy, error, setError, send, accept, label };
}

/** A hidden file input, `multiple`, that resets so the same file can be re-picked. */
export function FilePicker({
  inputRef,
  accept,
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple
      className="sr-only"
      onChange={(e) => {
        const files = e.target.files;
        // Cleared BEFORE the handler runs, or choosing the same file twice in
        // a row fires no change event at all the second time.
        const copy = files ? Array.from(files) : [];
        e.target.value = "";
        onFiles(copy.length > 0 ? (copy as unknown as FileList) : null);
      }}
    />
  );
}

function Upload({ kind, onItem }: { kind: MediaKind; onItem: (item: PickedMedia) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const up = useUploader(kind, onItem);

  return (
    <div className="flex flex-1 items-center justify-center p-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void up.send(e.dataTransfer.files);
        }}
        className={`flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          over ? "border-primary bg-surface-2" : "border-border"
        }`}
      >
        <p className="text-sm text-muted">Drop files here — as many as you like</p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={up.busy}
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
        >
          {up.label ?? "Choose files"}
        </button>
        <FilePicker inputRef={input} accept={up.accept} onFiles={(f) => void up.send(f)} />
        {kind === "image" && (
          <p className="text-xs text-muted">
            Any size. They are resized for the web on the way in, so photos straight off a phone are
            fine.
          </p>
        )}
        {up.error && <p className="text-sm text-primary">{up.error}</p>}
      </div>
    </div>
  );
}

/**
 * The picture, whole.
 *
 * `object-cover` crops to a 16:10 box, and a media library is the one place
 * that is wrong: a 290×53 payment strip and a 615×64 logo both arrived as a
 * close-up of their middle, which is not enough of either to recognise. The
 * ground stays visible around it so a transparent PNG reads as transparent
 * rather than as a picture with white in it.
 */
function Thumb({ item, whole = false }: { item: PickedMedia; whole?: boolean }) {
  if (item.mime.startsWith("image/") && item.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.url}
        alt={item.alt ?? ""}
        // In the details panel the box grows with the picture up to a cap, so a
        // tall one is not letterboxed into a strip — and cannot push the rest
        // of the panel down for ever either.
        className={`w-full rounded-lg bg-surface-2 object-contain p-1 ${
          whole ? "max-h-52 shrink-0" : "aspect-[16/10]"
        }`}
      />
    );
  }
  return (
    <span className="flex aspect-[16/10] w-full items-center justify-center rounded-lg bg-surface-2 text-xs text-muted">
      {item.mime.startsWith("audio/") ? "Audio" : "Document"}
    </span>
  );
}

/** The button that opens it, for anywhere a file is being chosen. */
export function MediaButton({
  kind,
  onPick,
  label,
  bare = false,
}: {
  kind: MediaKind;
  onPick: (item: PickedMedia) => void;
  label: React.ReactNode;
  /** No pill around it — for when the label IS the control, like a thumbnail. */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          bare
            ? "shrink-0"
            : "w-fit rounded-full border border-border bg-surface px-4 py-2 text-sm transition-colors hover:border-primary"
        }
      >
        {label}
      </button>
      <MediaModal
        kind={kind}
        open={open}
        onClose={() => setOpen(false)}
        onPick={(item) => {
          onPick(item);
          setOpen(false);
        }}
      />
    </>
  );
}
