"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { MediaWithUrl } from "@/lib/media-urls";
import type { MediaKind } from "@/lib/media-library";
import {
  describeMediaAction,
  adoptStoredFilesAction,
  type DescribeState,
  type AdoptState,
} from "@/app/admin/media/actions";

const TABS: { key: MediaKind | null; label: string }[] = [
  { key: null, label: "Everything" },
  { key: "image", label: "Images" },
  { key: "audio", label: "Audio" },
  { key: "document", label: "Documents" },
];

export function MediaGrid({ items, kind }: { items: MediaWithUrl[]; kind: MediaKind | null }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.label}
              href={t.key ? `/admin/media?kind=${t.key}` : "/admin/media"}
              className={
                (t.key ?? null) === kind
                  ? "rounded-full bg-fg px-4 py-1.5 text-sm text-bg"
                  : "rounded-full border border-border px-4 py-1.5 text-sm text-muted hover:text-fg"
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Adopt />
      </div>

      {items.length === 0 ? (
        <p className="text-muted">
          Nothing here yet. Upload a cover or a lesson file and it will appear — or use{" "}
          <b className="font-medium text-fg">Find files</b> above to take in anything uploaded
          before this page existed.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
              <Thumb item={item} />
              <div className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{item.name}</span>
                <span className="text-xs text-muted">
                  {item.width && item.height ? `${item.width} × ${item.height}` : item.mime}
                  {item.size > 0 && ` · ${Math.max(1, Math.round(item.size / 1024))}KB`}
                </span>
                {/* Missing alt text is worth seeing at a glance: it is what a
                    screen reader reads out, and what a search engine reads
                    instead of the picture. */}
                {item.mime.startsWith("image/") && (
                  <span className={item.alt ? "truncate text-xs text-muted" : "text-xs text-primary"}>
                    {item.alt || "No alt text"}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(open === item.id ? null : item.id)}
                className="w-fit text-xs text-muted underline hover:text-fg"
              >
                {open === item.id ? "Close" : "Edit"}
              </button>
              {open === item.id && <Describe item={item} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Describe({ item }: { item: MediaWithUrl }) {
  const [state, action, pending] = useActionState<DescribeState, FormData>(describeMediaAction, {});
  const isImage = item.mime.startsWith("image/");
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-border pt-2">
      <input type="hidden" name="id" value={item.id} />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input
          name="name"
          defaultValue={item.name}
          className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
        />
      </label>
      {isImage && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Alt text
          <input
            name="alt"
            defaultValue={item.alt ?? ""}
            placeholder="What is in the picture"
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
          <span>
            Describe it for someone who cannot see it. Leave empty if it is decoration and says
            nothing the words nearby do not.
          </span>
        </label>
      )}
      {state.error && <span className="text-xs text-primary">{state.error}</span>}
      {state.ok && <span className="text-xs text-navy">Saved.</span>}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full border border-border px-4 py-1.5 text-xs transition-colors hover:border-primary disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function Adopt() {
  const [state, action, pending] = useActionState<AdoptState, FormData>(
    async () => adoptStoredFilesAction(),
    {},
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm transition-colors hover:border-primary disabled:opacity-60"
      >
        {pending ? "Looking…" : "Find files"}
      </button>
      {state.error && <span className="text-xs text-primary">{state.error}</span>}
      {state.added !== undefined && (
        <span className="text-xs text-muted">
          {state.added === 0 ? "Nothing new." : `Added ${state.added}.`}
        </span>
      )}
    </form>
  );
}

function Thumb({ item }: { item: MediaWithUrl }) {
  if (item.mime.startsWith("image/") && item.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.url}
        alt={item.alt ?? ""}
        className="aspect-[16/10] w-full rounded-lg bg-surface-2 object-cover"
      />
    );
  }
  return (
    <span className="flex aspect-[16/10] w-full items-center justify-center rounded-lg bg-surface-2 text-xs text-muted">
      {item.mime.startsWith("audio/") ? "Audio" : "Document"}
    </span>
  );
}
