"use client";

import { useEffect, useState } from "react";
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
};

/**
 * Choose a file this store already has.
 *
 * The alternative it replaces is uploading the same photo a third time, under a
 * third name, because there was no way to find the first two. Which is also why
 * this sits NEXT TO the file input rather than replacing it: a new file is
 * still the common case, and a picker that made you dismiss a library to get to
 * an upload button would be a worse version of what was here before.
 *
 * One kind at a time. An image picker that offered a PDF would let someone put
 * a broken image on a live sales page, and nothing about the choice would have
 * looked wrong at the time.
 */
export function MediaPicker({
  kind,
  onPick,
  label = "Choose from library",
}: {
  kind: MediaKind;
  onPick: (item: PickedMedia) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-fit rounded-full border border-border bg-surface px-4 py-2 text-sm transition-colors hover:border-fg"
      >
        {open ? "Close library" : label}
      </button>
      {open && (
        <Library
          kind={kind}
          onPick={(item) => {
            onPick(item);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Library({ kind, onPick }: { kind: MediaKind; onPick: (item: PickedMedia) => void }) {
  const [items, setItems] = useState<PickedMedia[] | null>(null);
  const [q, setQ] = useState("");
  const [failed, setFailed] = useState(false);

  // Loaded when the picker opens, and again when the search settles. Not on
  // every keystroke: a library of three hundred files would be three hundred
  // queries for someone typing a filename.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/media/library?kind=${kind}&q=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        if (live) {
          setItems(data.items ?? []);
          setFailed(false);
        }
      } catch {
        if (live) setFailed(true);
      }
    }, q ? 300 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [kind, q]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name"
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
      />
      {failed && <p className="text-sm text-primary">Could not load the library. Try again.</p>}
      {items === null && !failed && <p className="text-sm text-muted">Loading…</p>}
      {items?.length === 0 && (
        <p className="text-sm text-muted">
          Nothing here yet. Anything you upload from now on appears in this list.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="flex w-full flex-col gap-1 rounded-lg border border-border p-2 text-left transition-colors hover:border-primary"
              >
                <Thumb item={item} />
                <span className="truncate text-xs">{item.name}</span>
                {/* The dimensions, because "which of these two crops is the wide
                    one" is the actual question being asked at this moment. */}
                <span className="text-[11px] text-muted">
                  {item.width && item.height ? `${item.width} × ${item.height}` : item.mime}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ item }: { item: PickedMedia }) {
  if (item.mime.startsWith("image/") && item.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.url}
        alt={item.alt ?? ""}
        className="aspect-[16/10] w-full rounded bg-surface-2 object-cover"
      />
    );
  }
  return (
    <span className="flex aspect-[16/10] w-full items-center justify-center rounded bg-surface-2 text-xs text-muted">
      {item.mime.startsWith("audio/") ? "Audio" : "Document"}
    </span>
  );
}
