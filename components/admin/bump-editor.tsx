"use client";

import { useActionState, useMemo, useState } from "react";
import { saveBumpAction, type BumpSaveState } from "@/app/admin/offers/[id]/bump/actions";
import { OrderBump } from "@/components/checkout/order-bump";
import { buildBumpView, normalizeAccent, BUMP_ACCENT_DEFAULT, defaultBanner, type BumpChoice } from "@/lib/bump";
import { inputClass } from "@/components/admin/form-controls";
import type { Offer } from "@/lib/types";

// Bump editor: fields left, the real bump right, updating as you type.
//
// The preview is not a mock-up. It calls buildBumpView and renders the same
// OrderBump the checkout renders, so it cannot show something a buyer would not
// see. Everything derived — the price block, the save badge — recomputes from
// the offer's real numbers as you edit the words around them.

const SWATCHES = [
  { hex: BUMP_ACCENT_DEFAULT, name: "Terracotta" },
  { hex: "#11325b", name: "Navy" },
  { hex: "#832a63", name: "Plum" },
  { hex: "#1f7a4d", name: "Green" },
  { hex: "#8a5a2b", name: "Bronze" },
];

export function BumpEditor({ offer, alt }: { offer: Offer; alt?: Offer | null }) {
  const [state, action, pending] = useActionState<BumpSaveState, FormData>(saveBumpAction, {});

  // Pre-filled with what is live. The banner shows its effective value, so
  // saving without touching it keeps what buyers already see, and clearing the
  // box is how you turn it off.
  const [headline, setHeadline] = useState(offer.bumpHeadline ?? "");
  const [description, setDescription] = useState(offer.bumpDescription ?? "");
  const [banner, setBanner] = useState(offer.bumpBanner ?? defaultBanner(offer));
  const [bullets, setBullets] = useState((offer.bumpBullets ?? []).join("\n"));
  const [note, setNote] = useState(offer.bumpNote ?? "");
  const [accent, setAccent] = useState(normalizeAccent(offer.bumpAccent));
  const [choice, setChoice] = useState<BumpChoice>("none");

  const view = useMemo(
    () =>
      buildBumpView({
        ...offer,
        bumpHeadline: headline,
        bumpDescription: description,
        bumpBanner: banner,
        bumpBullets: bullets.split("\n").map((b) => b.trim()).filter(Boolean),
        bumpNote: note,
        bumpAccent: accent,
      }),
    [offer, headline, description, banner, bullets, note, accent],
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="offerId" value={offer.id} />
      <input type="hidden" name="bumpHeadline" value={headline} />
      <input type="hidden" name="bumpDescription" value={description} />
      <input type="hidden" name="bumpBanner" value={banner} />
      <input type="hidden" name="bumpBullets" value={bullets} />
      <input type="hidden" name="bumpNote" value={note} />
      <input type="hidden" name="bumpAccent" value={accent} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* ---- fields ---- */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <span className="kicker text-muted">Content</span>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Headline
              <span className="ml-2 font-normal text-muted">Empty falls back to the offer&rsquo;s own</span>
            </span>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder={offer.headline}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Description
              <span className="ml-2 font-normal text-muted">Empty falls back to the offer&rsquo;s own</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={offer.description ?? ""}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Banner
              <span className="ml-2 font-normal text-muted">Clear it to remove the banner</span>
            </span>
            <input
              value={banner}
              onChange={(e) => setBanner(e.target.value)}
              placeholder="No banner"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Bullets
              <span className="ml-2 font-normal text-muted">One per line</span>
            </span>
            <textarea
              value={bullets}
              onChange={(e) => setBullets(e.target.value)}
              rows={4}
              placeholder="Drafts in your voice&#10;Instagram + LinkedIn"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Callout
              <span className="ml-2 font-normal text-muted">Why it pairs with this product</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Leave empty to hide the callout"
              className={inputClass}
            />
          </label>

          <span className="kicker mt-1 text-muted">Appearance</span>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Accent colour</span>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((s) => (
                <button
                  key={s.hex}
                  type="button"
                  title={s.name}
                  aria-label={s.name}
                  aria-pressed={accent === s.hex}
                  onClick={() => setAccent(s.hex)}
                  className={`size-9 rounded-lg border-2 transition-colors ${
                    accent === s.hex ? "border-fg" : "border-transparent"
                  }`}
                  style={{ background: s.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" }}
                />
              ))}
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(normalizeAccent(e.target.value))}
                aria-label="Custom accent colour"
                className="size-9 cursor-pointer rounded-lg border border-border bg-surface p-1"
              />
              <span className="font-mono text-sm text-muted">{accent}</span>
            </div>
            {view.ink !== "#ffffff" && (
              <p className="text-sm text-muted">
                Dark text is used on this colour — white would not be readable against it.
              </p>
            )}
          </div>

          <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
            The price, the terms and the badge come from the offer&rsquo;s own numbers, so this page
            cannot advertise a discount the checkout would not apply. Change them on the{" "}
            <a href={`/admin/offers/${offer.id}`} className="underline">
              offer
            </a>
            .
          </p>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save bump"}
            </button>
            <span className="text-sm text-muted" aria-live="polite">
              {state.error ? state.error : state.saved ? "Saved. The checkout is updated." : ""}
            </span>
          </div>
        </div>

        {/* ---- preview ---- */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="kicker text-muted">Preview — how a buyer sees it</span>
            <button
              type="button"
              onClick={() => setChoice((c) => (c === "none" ? "main" : "none"))}
              className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-fg"
            >
              {choice === "none" ? "Show taken" : "Show untaken"}
            </button>
          </div>

          {/* The checkout's own background, so contrast is judged truthfully
              rather than against the admin surface. */}
          <div className="rounded-2xl border border-border bg-bg p-4">
            <OrderBump
              view={view}
              // The preview has to show the control the checkout will render.
              // With a second price that is a radio group, not a tickbox, and
              // reviewing the tickbox version would be reviewing a card nobody
              // gets.
              alt={alt ? buildBumpView(alt) : null}
              choice={choice}
              onChoose={setChoice}
            />
          </div>

          <p className="text-sm text-muted">
            This is the component the checkout renders, not a mock-up — so it cannot drift from what
            buyers actually see.
          </p>
        </div>
      </div>
    </form>
  );
}
