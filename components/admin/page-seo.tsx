"use client";

import { useActionState, useState } from "react";
import { savePageSettingsAction } from "@/app/admin/pages/actions";
import { MediaButton, type PickedMedia } from "@/components/admin/media-modal";
import { publicCoverUrl } from "@/lib/media-url";
import type { OwnerType } from "@/lib/pages";

/**
 * How this page looks in a search result and a pasted link.
 *
 * Open by default, unlike the custom-code panel below it. This is part of
 * writing a sales page rather than an escape hatch from one, and the whole
 * reason it exists is that nobody knew it was missing: every product page in
 * the shop shared the store's title and share card, so two products pasted into
 * the same thread previewed identically.
 *
 * Every field may be left empty and empty is not blank — it falls through to
 * what the page is already called, and then to the store's defaults. The
 * placeholder shows what that fallback actually is, because a field whose
 * emptiness has consequences should say what they are.
 */

const input =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

export function PageSeo({
  ownerType,
  ownerId,
  metaTitle,
  metaDescription,
  shareImagePath,
  fallbackTitle,
  fallbackDescription,
  fallbackImageUrl,
}: {
  ownerType: OwnerType;
  ownerId: string;
  metaTitle: string;
  metaDescription: string;
  shareImagePath: string;
  /** What this page is called when nothing is typed. */
  fallbackTitle: string;
  fallbackDescription: string;
  /** The picture used when none is chosen — the page's cover, or the store's. */
  fallbackImageUrl: string | null;
}) {
  const [state, action, pending] = useActionState(savePageSettingsAction, {});
  const [title, setTitle] = useState(metaTitle);
  const [description, setDescription] = useState(metaDescription);
  const [path, setPath] = useState(shareImagePath);
  const [gone, setGone] = useState(false);

  const shownTitle = title.trim() || fallbackTitle;
  const shownDescription = description.trim() || fallbackDescription;
  const chosen = publicCoverUrl(path || null);
  const shownImage = (!gone && chosen) || fallbackImageUrl;

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-3 px-5 pt-4">
        <span className="font-medium">Search &amp; sharing</span>
        <span className="text-sm text-muted">
          the title, the description and the picture behind a shared link
        </span>
      </div>

      <form action={action} className="grid gap-5 px-5 pb-5 pt-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <input type="hidden" name="ownerType" value={ownerType} />
        <input type="hidden" name="ownerId" value={ownerId} />

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Meta title</span>
              <span
                className={`text-xs tabular-nums ${title.length > 60 ? "text-primary" : "text-muted"}`}
              >
                {title.length}/60
              </span>
            </span>
            <span className="text-xs text-muted">
              Google shows about 60 characters. Longer is not wrong — it is cut off, and cut off by
              them rather than by you.
            </span>
            <input
              name="metaTitle"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={fallbackTitle}
              className={input}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Meta description</span>
              <span
                className={`text-xs tabular-nums ${
                  description.length > 155 ? "text-primary" : "text-muted"
                }`}
              >
                {description.length}/155
              </span>
            </span>
            <span className="text-xs text-muted">
              The sentence under the title. It is not a ranking factor — it is the thing that
              decides whether anybody clicks the result.
            </span>
            <textarea
              name="metaDescription"
              value={description}
              maxLength={400}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={fallbackDescription || "Left empty, the page's own tagline is used."}
              className={input}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Share image</span>
            <span className="text-xs text-muted">
              1200 × 630. Left empty this page uses its own cover, then the store&rsquo;s share
              image — so a link is never shared without a picture.
            </span>
            <span className="flex items-center gap-3">
              <input type="hidden" name="shareImagePath" value={path} />
              <MediaButton
                kind="image"
                onPick={(item: PickedMedia) => {
                  setPath(item.path);
                  setGone(false);
                }}
                label={path ? "Replace" : "Choose"}
              />
              {path && (
                <button
                  type="button"
                  onClick={() => {
                    setPath("");
                    setGone(false);
                  }}
                  className="text-xs text-muted underline-offset-2 hover:text-primary hover:underline"
                >
                  Remove
                </button>
              )}
              {gone && (
                <span className="text-xs text-primary">
                  That file is no longer in the library — choose it again.
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {state.error && <span className="text-sm text-primary">{state.error}</span>}
            {state.saved && !state.error && <span className="text-sm text-muted">Saved.</span>}
          </div>
        </div>

        {/* Two previews rather than a description of them. Both are wrong in
            different directions when a field is left empty, and seeing which
            one falls back to what is faster than reading three hints. */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="kicker text-muted">In a search result</span>
            <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface-2 p-3">
              <span className="truncate text-[0.7rem] text-muted">grow.greaterinside.com</span>
              <span className="line-clamp-2 text-[0.95rem] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
                {shownTitle}
              </span>
              <span className="line-clamp-3 text-xs leading-relaxed text-muted">
                {shownDescription || "No description — Google will invent one from the page."}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="kicker text-muted">Pasted into a chat</span>
            <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
              <span className="block aspect-[1200/630] w-full bg-surface">
                {shownImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={shownImage}
                    alt=""
                    className="size-full object-cover"
                    onError={() => setGone(true)}
                  />
                ) : (
                  <span className="grid size-full place-items-center text-xs text-muted">
                    no picture — the link previews as text
                  </span>
                )}
              </span>
              <span className="flex flex-col gap-0.5 p-3">
                <span className="line-clamp-2 text-sm font-medium">{shownTitle}</span>
                <span className="line-clamp-2 text-xs text-muted">{shownDescription}</span>
              </span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
