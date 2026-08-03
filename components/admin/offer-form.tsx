"use client";

import { useActionState } from "react";
import { saveOffer, removeOffer, type SaveState } from "@/app/admin/offers/actions";
import { inputClass as input, Field, Section } from "@/components/admin/form-controls";
import type { Offer } from "@/lib/types";
import type { ProductOption, AppOption } from "@/lib/admin";
import { sectionsToForm } from "@/lib/oto-sections";

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
            <input name="trialDays" type="number" min="0" defaultValue={offer?.trialDays ?? ""} className={input} />
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
        title="1 · On the checkout bump"
        hint="The tick-box beside the payment form. Two lines only — the price line under them is generated from Price, Interval and Trial days, so it can never disagree with what is charged."
      >
        <Field label="Bump headline" hint="bold line. Leave empty to reuse the upsell headline below.">
          <input
            name="bumpHeadline"
            defaultValue={offer?.bumpHeadline ?? ""}
            placeholder={offer?.headline ?? "Add … free for 7 days"}
            className={input}
          />
        </Field>
        <Field label="Bump description" hint="grey line under it. Leave empty to reuse the upsell description.">
          <textarea
            name="bumpDescription"
            defaultValue={offer?.bumpDescription ?? ""}
            placeholder={offer?.description ?? ""}
            rows={2}
            className={input}
          />
        </Field>
      </Section>

      <Section
        title="2 · On the upsell page, storefront and library"
        hint="Used by the one-click upsell page after checkout, the storefront section, the library offer, and the standalone offer checkout. Changing these changes all four."
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
        <Field
          label="ActiveCampaign tag ID"
          hint="Numeric id, not the tag name. Applied when this offer is granted and removed if it is cancelled or refunded. Leave empty for no tag."
        >
          <input
            name="activecampaignTagId"
            defaultValue={offer?.activecampaignTagId ?? ""}
            inputMode="numeric"
            placeholder="e.g. 43"
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
