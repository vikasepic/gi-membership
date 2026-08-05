"use client";

import { useActionState, useState } from "react";
import { saveOffer, removeOffer, type SaveState } from "@/app/admin/offers/actions";
import { inputClass as input, Field, Section } from "@/components/admin/form-controls";
import type { Offer } from "@/lib/types";
import type { ProductOption, AppOption } from "@/lib/admin";
import { sectionsToForm } from "@/lib/oto-sections";

/** Layouts that still read the fields below. Ten sections and Custom do not. */
const LEGACY_LAYOUTS = new Set(["short", "visual", "long", "sales"]);

export function OfferForm({
  offer,
  products,
  apps,
}: {
  offer?: Offer;
  products: ProductOption[];
  apps: AppOption[];
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveOffer, {});
  const sections = sectionsToForm(offer?.otoSections as never);
  // Held in state so the trial tag field appears the moment trial days are
  // typed, rather than after a save — the field is the explanation of what a
  // trial means to the list, and it is needed while deciding to have one.
  const [trialDays, setTrialDays] = useState(String(offer?.trialDays ?? ""));
  const hasTrial = Number(trialDays) > 0;

  return (
    <form action={action} className="flex flex-col gap-6">
      {offer && <input type="hidden" name="id" value={offer.id} />}

      <Section title="What this offer is" hint="Internal naming — buyers never see these.">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Name" required hint="internal label">
          <input name="name" defaultValue={offer?.name ?? ""} required className={input} />
        </Field>
        <Field label="Key" required hint="lowercase-with-hyphens">
          <input name="key" defaultValue={offer?.key ?? ""} required className={input} />
        </Field>
      </div>
      </Section>

      {/* Grant — what the offer gives. */}
      <Section title="What the buyer gets" hint="Either a product they own outright, or access to a connected app.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Grant type" required>
            <select name="grantType" defaultValue={offer?.grantType ?? "product"} className={input}>
              <option value="product">Product (one-off)</option>
              <option value="subscription">App subscription</option>
            </select>
          </Field>
          <Field label="Product" hint="if grant = product">
            <select name="grantProductId" defaultValue={offer?.grantProductId ?? ""} className={input}>
              <option value="">— none —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </Field>
          <Field label="App" hint="if grant = subscription">
            <select name="grantAppId" defaultValue={offer?.grantAppId ?? ""} className={input}>
              <option value="">— none —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Entitlement key" hint="what the app grants, e.g. content-engine">
          <input name="grantEntitlementKey" defaultValue={offer?.grantEntitlementKey ?? ""} className={input} />
        </Field>
      </Section>

      {/* Billing. */}
      <Section title="How it bills" hint="One-time is charged once. Recurring bills on a schedule — add trial days for a free period first.">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Field label="Billing type" required>
            <select name="billingType" defaultValue={offer?.billingType ?? "one_time"} className={input}>
              <option value="one_time">One-time</option>
              <option value="recurring">Recurring</option>
            </select>
          </Field>
          <Field label="Interval" hint="recurring">
            <select name="interval" defaultValue={offer?.interval ?? ""} className={input}>
              <option value="">—</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </Field>
          <Field label="Every" hint="interval count">
            <input name="intervalCount" type="number" min="1" defaultValue={offer?.intervalCount ?? ""} className={input} />
          </Field>
          <Field label="Trial days" hint="recurring">
            <input
              name="trialDays"
              type="number"
              min="0"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className={input}
            />
          </Field>
        </div>
      </Section>

      <Section title="Price" hint="Charged on the card already saved at checkout — no re-entry.">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Field label="Price ($)" required>
          <input name="price" type="number" min="0" step="1" defaultValue={offer ? offer.priceCents / 100 : ""} required className={input} />
        </Field>
        <Field label="Compare-at ($)" hint="optional anchor">
          <input name="compareAt" type="number" min="0" step="1" defaultValue={offer?.compareAtCents ? offer.compareAtCents / 100 : ""} className={input} />
        </Field>
        <Field label="Currency">
          <input name="currency" defaultValue={offer?.currency ?? "usd"} className={input} />
        </Field>
      </div>
      </Section>

      {/* Each block below is named for the SURFACE it appears on. The old
          single "What the buyer sees" section edited five surfaces at once and
          said so nowhere. */}
      <Section
        title="How this offer reads"
        hint="Used by the storefront section, the library offer, and the standalone offer checkout. The sales page and the checkout bump have their own editors — the links are at the top of this page."
      >
        <Field label="Headline" required>
          <input name="headline" defaultValue={offer?.headline ?? ""} required className={input} />
        </Field>
        <Field label="Description">
          <textarea name="description" defaultValue={offer?.description ?? ""} rows={2} className={input} />
        </Field>
        <Field label="Bullets" hint="one per line">
          <textarea name="bullets" defaultValue={offer?.bullets.join("\n") ?? ""} rows={3} className={input} />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Accept button">
            <input name="acceptLabel" defaultValue={offer?.acceptLabel ?? "Yes, add this"} className={input} />
          </Field>
          <Field label="Decline button">
            <input name="declineLabel" defaultValue={offer?.declineLabel ?? "No thanks"} className={input} />
          </Field>
        </div>
        <Field label="Image URL" hint="optional">
          <input name="imageUrl" defaultValue={offer?.imageUrl ?? ""} className={input} />
        </Field>
        <Field
          label="Upsell page layout"
          hint="Only used when this offer is set as a product's upsell. Custom renders a coded page registered for this offer's key — it falls back to Visual if none exists yet."
        >
          <select
            name="otoTemplate"
            defaultValue={offer?.otoTemplate ?? "visual"}
            className={input}
          >
            <option value="short">Short — headline, bullets, button</option>
            <option value="visual">Visual — image or video led (default)</option>
            <option value="long">Long-form — story, then the offer</option>
            <option value="sales">Sales page — stats, proof, comparison, FAQ</option>
            <option value="sections">Ten sections — the standard sales page</option>
            <option value="custom">Custom — coded page for this offer</option>
          </select>
          {offer && (
            <a
              href={`/admin/offers/${offer.id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              Preview every layout with this offer&rsquo;s content &rarr;
            </a>
          )}
        </Field>
        {/* Only the older layouts read these. They stay in the DOM inside a
            closed <details> rather than being removed, because form controls in
            a collapsed details element still submit — dropping them from the
            markup would blank the columns on the next save. */}
        <details className="rounded-xl border border-border" open={LEGACY_LAYOUTS.has(offer?.otoTemplate ?? "")}>
          <summary className="cursor-pointer px-4 py-3 text-sm">
            Fields for the older layouts
            <span className="ml-2 text-muted">
              Unused by Ten sections — kept so switching back loses nothing
            </span>
          </summary>
          <div className="flex flex-col gap-5 border-t border-border p-4">
        <Field
          label="Upsell video URL"
          hint="Embed URL (YouTube/Vimeo embed form). Used by the Visual and Long-form layouts; falls back to the image above."
        >
          <input name="otoVideoUrl" defaultValue={offer?.otoVideoUrl ?? ""} className={input} />
        </Field>
        <Field label="Upsell body copy" hint="Used by the Long-form and Sales layouts. Blank line between paragraphs.">
          <textarea name="otoBody" defaultValue={offer?.otoBody ?? ""} rows={5} className={input} />
        </Field>

        {/* Sales-page sections. One item per line, fields separated by | .
            A textarea rather than a block editor: this is what someone can
            actually fill in at speed while writing a launch. */}
        <Field label="Stats" hint="Sales layout. One per line:  value | label   e.g.  ~2 hrs | Time required">
          <textarea name="otoStats" defaultValue={sections.stats} rows={4} className={input} />
        </Field>
        <Field label="Problem" hint="Sales layout. First paragraph is the heading; blank line between paragraphs.">
          <textarea name="otoProblem" defaultValue={sections.problem} rows={4} className={input} />
        </Field>
        <Field label="Benefits" hint="Sales layout. One per line:  title | body">
          <textarea name="otoBenefits" defaultValue={sections.benefits} rows={5} className={input} />
        </Field>
        <Field label="Testimonials" hint="Sales layout. One per line:  name | result | quote">
          <textarea name="otoTestimonials" defaultValue={sections.testimonials} rows={4} className={input} />
        </Field>
        <Field label="Comparison" hint="Sales layout. One per line:  option | cost | time">
          <textarea name="otoComparison" defaultValue={sections.comparison} rows={4} className={input} />
        </Field>
        <Field label="FAQ" hint="Sales layout. One per line:  question | answer">
          <textarea name="otoFaq" defaultValue={sections.faq} rows={5} className={input} />
        </Field>
          </div>
        </details>

        {/* The offer's own tag IS the buyer tag. It is only during a trial
            that "granted" and "paid for" differ, and that is what the trial tag
            is for — a separate access field just got the same id typed twice. */}
        <Field
          label="Buyer tag ID"
          hint={
            hasTrial
              ? "Numeric id, not the tag name. Applied when the trial converts and money is first taken — not when the trial starts. Removed if they cancel, so this tag means paying right now."
              : "Numeric id, not the tag name. Applied when they pay, removed if they cancel or are refunded. This tag means paying right now."
          }
        >
          <input
            name="activecampaignTagId"
            defaultValue={offer?.activecampaignTagId ?? ""}
            inputMode="numeric"
            placeholder="e.g. 43"
            className={input}
          />
        </Field>

        {/* Only for an offer that actually has a trial. Without one there is no
            trialing state to tag, and a field that can never fire is a field
            someone fills in and then wonders about. */}
        {hasTrial && (
          <Field
            label="Trial tag ID"
            hint="Applied when the trial starts, removed the moment they pay. Kept if they cancel inside the trial — cancelled WITH this tag never paid, cancelled without it did."
          >
            <input
              name="activecampaignTrialTagId"
              defaultValue={offer?.activecampaignTrialTagId ?? ""}
              inputMode="numeric"
              placeholder="e.g. 44"
              className={input}
            />
          </Field>
        )}

        <Field
          label="Cancelled tag ID"
          hint="Applied when access ends, by cancellation or refund, and never removed. Cancelled WITH a trial tag never paid; cancelled without one did."
        >
          <input
            name="activecampaignCancelledTagId"
            defaultValue={offer?.activecampaignCancelledTagId ?? ""}
            inputMode="numeric"
            placeholder="e.g. 46"
            className={input}
          />
        </Field>
      </Section>

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="active" defaultChecked={offer ? offer.active : true} className="size-4 accent-[var(--primary)]" />
        Active (available to attach)
      </label>

      {state.error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : offer ? "Save changes" : "Create offer"}
        </button>
        {offer && (
          <button type="submit" formAction={removeOffer} className="text-sm text-muted hover:text-primary">
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
