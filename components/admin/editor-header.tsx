"use client";

import Link from "next/link";
import { MediaButton, type PickedMedia } from "@/components/admin/media-modal";
import { publicCoverUrl } from "@/lib/media-url";

/**
 * Everything above the tabs, in one row.
 *
 * It used to be a heading block, a sentence nobody reads twice, two link
 * buttons, and a five-hundred-pixel card holding one picture and one button —
 * about nine hundred pixels before the first field. The picture is a thumbnail
 * here, and clicking it opens the same media window everything else uses.
 */
export function EditorHeader({
  backHref,
  backLabel,
  title,
  meta,
  status,
  coverUrl,
  onPickCover,
  links,
  dirty,
  pending,
  saveLabel,
  saveStatus,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  /** Slug, price — the identifying detail, small. */
  meta?: string;
  /**
   * Live or not, and what that MEANS.
   *
   * It was a 1.5px dot and a grey word, which is a label for somebody who
   * already knows the answer. The one that matters is "draft", and its
   * consequence — the public address returns 404 to everyone — is the thing an
   * editor needs and the thing they were not being told.
   */
  status?: { live: boolean; label: string; note?: string };
  coverUrl: string | null;
  /** Absent for things with no artwork of their own. */
  onPickCover?: (item: PickedMedia) => void;
  links?: React.ReactNode;
  dirty: boolean;
  pending: boolean;
  saveLabel: string;
  /** What the last save did. Replaces the bare "Unsaved" when given. */
  saveStatus?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-bg/95 px-1 py-2 backdrop-blur">
      {onPickCover ? (
        <MediaButton
          kind="image"
          onPick={onPickCover}
          label={
            <span className="group relative block size-10 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
              {coverUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={coverUrl} alt="" className="size-full object-cover" />
              )}
              <span className="absolute inset-0 hidden place-items-center bg-black/55 text-[0.55rem] text-white group-hover:grid">
                Replace
              </span>
            </span>
          }
          bare
        />
      ) : null}

      <span className="flex min-w-0 flex-col leading-tight">
        <Link href={backHref} className="kicker w-fit text-muted transition-colors hover:text-fg">
          &larr; {backLabel}
        </Link>
        <span className="truncate font-display text-[0.95rem]">{title}</span>
        {meta && <span className="truncate text-[0.68rem] text-muted">{meta}</span>}
      </span>

      {status && (
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            status.live
              ? "bg-[#3f9b6d]/12 text-[#2f7553]"
              : // Not grey. A draft is the state that surprises people, and a
                // surprise in the same colour as the furniture is not a state,
                // it is a decoration.
                "bg-primary/12 text-primary"
          }`}
          title={status.note}
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${status.live ? "bg-[#3f9b6d]" : "bg-primary"}`}
          />
          {status.label}
        </span>
      )}

      <span className="ml-auto flex flex-wrap items-center gap-2">
        {links}
        {saveStatus ?? (dirty && <span className="text-xs text-primary">Unsaved</span>)}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : saveLabel}
        </button>
      </span>
    </div>
  );
}

export { publicCoverUrl };
