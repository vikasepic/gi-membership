"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveOffer, removeOffer, type SaveState } from "@/app/admin/offers/actions";
import { inputClass as input, Field, Section } from "@/components/admin/form-controls";
import { OfferPriceFields, type PriceUsage } from "@/components/admin/offer-price-fields";
import { EditorTabs, TabPanel } from "@/components/admin/editor-tabs";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { SaveStatus, useJustSaved, useSlowSave } from "@/components/admin/save-status";
import { OFFER_FIELD_TABS, summarise, tabToShow, tabsWithErrors } from "@/lib/save-feedback";
import type { Offer } from "@/lib/types";
import type { OfferPrice } from "@/lib/offer-prices";
import type { ProductOption, AppOption, OfferOption } from "@/lib/admin";
import { money } from "@/lib/money";
import { channelLabel } from "@/lib/app-channels";
import { ImageField } from "@/components/admin/image-field";
import { sectionsToForm } from "@/lib/oto-sections";

/** Layouts that still read the fields below. Ten sections and Custom do not. */
const LEGACY_LAYOUTS = new Set(["short", "visual", "long", "sales"]);

export function OfferForm({
  offer,
  products,
  apps,
  offers = [],
  defaultCurrency = "usd",
  usage = {},
}: {
  offer?: Offer;
  products: ProductOption[];
  apps: AppOption[];
  /** Other offers, for this page's second price. */
  offers?: OfferOption[];
  /** The store's currency, so a new offer starts in the one it actually sells in. */
  defaultCurrency?: string;
  /** How many people are on each price — a row with any cannot be repriced. */
  usage?: PriceUsage;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveOffer, {});
  const sections = sectionsToForm(offer?.otoSections as never);
  // Held in state so the trial tag field appears the moment trial days are
  // typed, rather than after a save — the field is the explanation of what a
  // trial means to the list, and it is needed while deciding to have one.
  // ANY price with a trial, not one field. The trial tag is about what
  // happens to a buyer, and a buyer on the yearly with a trial gets tagged the
  // same as one on the monthly — so the field appears while any way to pay
  // offers one.
  const [prices, setPrices] = useState<OfferPrice[]>(offer?.prices ?? []);
  const hasTrial = prices.some((p) => (p.trialDays ?? 0) > 0);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState(offer ? offer.active : true);
  // Which app is being granted, so the channel tickboxes can follow it. An
  // app's channels are its own; nothing else on this form knows them.
  const [grantAppId, setGrantAppId] = useState(offer?.grantAppId ?? "");
  const grantedApp = apps.find((a) => a.id === grantAppId);
  const appChannels = grantedApp?.channels ?? [];
  const [clientErr, setClientErr] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);

  // Every required field, checked here rather than by the browser.
  //
  // The browser refuses to submit a form holding an invalid control it cannot
  // focus, and reports that only to the console. With the fields spread over
  // five tabs, an empty Name on a tab you are not looking at made the Save
  // button do nothing at all — no message, no pending, no clue. Checking it
  // ourselves is what lets the form say which field and walk you to it.
  function check(form: HTMLFormElement): Record<string, string> {
    const errs: Record<string, string> = {};
    for (const el of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "[required]",
    )) {
      if (!el.name) continue;
      if (!String(el.value ?? "").trim()) errs[el.name] = "Required";
    }
    return errs;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Delete has its own action and must not be blocked by save-validation.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter?.dataset.action === "delete") return;

    const errs = check(e.currentTarget);
    if (Object.keys(errs).length > 0) {
      e.preventDefault();
      setClientErr(errs);
      setAttempt((n) => n + 1);
    } else {
      setClientErr({});
    }
  }

  const allErrors = state.error ? { ...clientErr, _form: state.error } : clientErr;
  const problem = summarise(allErrors);
  const badTabs = tabsWithErrors(allErrors, OFFER_FIELD_TABS, "basics");
  const showTab = useMemo(
    () => tabToShow(clientErr, OFFER_FIELD_TABS, "", "basics"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempt],
  );
  const slow = useSlowSave(pending);
  const justSaved = useJustSaved(state.saved);
  useEffect(() => {
    if (state.saved) {
      setDirty(false);
      setClientErr({});
    }
  }, [state.saved]);

  return (
    /* noValidate: see check() — the browser's own validation cannot report a
       problem on a hidden tab, so it blocks the submit and says nothing. */
    <form
      action={action}
      onSubmit={onSubmit}
      onInput={() => setDirty(true)}
      className="flex flex-col gap-5"
      noValidate
    >
      {offer && <input type="hidden" name="id" value={offer.id} />}

      {/* The same bar the product editor carries, for the same reason: Save was
          at the bottom of everything. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-b border-border bg-bg/95 px-1 py-2.5 backdrop-blur">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Active
          <span className="text-muted">— available to attach</span>
        </label>
        <span className="ml-auto flex items-center gap-3">
          <SaveStatus
            pending={pending}
            slow={slow}
            justSaved={justSaved}
            problem={problem}
            dirty={dirty}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : offer ? "Save" : "Create offer"}
          </button>
        </span>
      </div>

      <EditorTabs
        showTab={showTab}
        tabs={[
          { key: "basics", label: "Basics", attention: badTabs.has("basics") },
          { key: "grants", label: "Grants", attention: badTabs.has("grants") },
          { key: "pricing", label: "Pricing", attention: badTabs.has("pricing") },
          { key: "copy", label: "Copy & pages", attention: badTabs.has("copy") },
          { key: "marketing", label: "Marketing", attention: badTabs.has("marketing") },
        ]}
      >

      <TabPanel tab="basics">

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
      </TabPanel>

      <TabPanel tab="grants">
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
              {/* The status is part of the name here on purpose. An active
                  offer granting a DRAFT product still delivers — the library
                  reads the course's status, not the product's — but /p/<slug>
                  is a 404 for everyone, so linking to it from an ad or an
                  email sends buyers nowhere. Nothing else in the admin says
                  so, and the bump on the live Product Validator funnel grants
                  exactly such a product. */}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.status === "draft" ? " — draft, /p/ link 404s" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="App" hint="if grant = subscription">
            <select
              name="grantAppId"
              value={grantAppId}
              onChange={(e) => setGrantAppId(e.target.value)}
              className={input}
            >
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

        {/* Which channels, inside the app.
            The entitlement key above says WHICH app and at what level; this
            says what of it. One offer can sell Instagram alone, LinkedIn
            alone, or both, without a second app or a second key.

            Only for an app that HAS channels. It used to show for every app
            that could be granted, because the first connected app had them —
            so the Funnel App offer carried an Instagram tickbox, and ticking
            it sent a channel to an app with no such idea. The app declares
            what it understands; nothing here invents it. */}
        {appChannels.length > 0 && (
          <Field
            label={`Channels in ${grantedApp?.name ?? "the app"}`}
            hint="what this unlocks once they are inside. Ticking none grants it at whatever the app's own default is — say which, rather than leaving it to the app to guess."
          >
            <div className="flex flex-wrap gap-4">
              {appChannels.map((value) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="grantChannels"
                    value={value}
                    defaultChecked={(offer?.grantChannels ?? []).includes(value)}
                    className="size-[18px] cursor-pointer accent-[var(--primary)]"
                  />
                  {channelLabel(value)}
                </label>
              ))}
            </div>
          </Field>
        )}
      </Section>

      {/* Billing. */}
      </TabPanel>

      <TabPanel tab="pricing">
      <Section
        title="Ways to pay"
        hint="One offer, however many prices. Monthly beside yearly used to mean building a second offer — its own copy, its own bump, its own tags — and two was the ceiling."
      >
        <OfferPriceFields
          prices={offer?.prices ?? []}
          currency={offer?.currency ?? defaultCurrency}
          name="prices"
          usage={usage}
          onChange={setPrices}
        />
        <Field label="Currency" hint="every way to pay shares it">
          <input name="currency" defaultValue={offer?.currency ?? defaultCurrency} className={input} />
        </Field>
      </Section>

      {/* Each block below is named for the SURFACE it appears on. The old
          single "What the buyer sees" section edited five surfaces at once and
          said so nowhere. */}
      </TabPanel>

      <TabPanel tab="copy">
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
        {/* The offer's own picture, chosen from the library rather than typed.
            It was a text box labelled "Image URL": an admin had to go and find
            an address, and nothing showed whether what they pasted resolved to
            anything — which is why two of the three offers have no image. */}
        <ImageField
          name="imageUrl"
          label="Image"
          hint="shown on the upsell page, in the offers list, and on the offer's card in a member's library"
          value={offer?.imageUrl ?? ""}
          stores="url"
        />
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

        {/* Only this offer's OWN page. A bump or an upsell reads its second
            price from the product that places it, because the same offer can
            be two prices there and one price elsewhere. */}
        <Field
          label="Second price on this offer's page"
          hint="Shown at /o/<key> only, as a second button beside the first. Bumps and upsells take theirs from the product. Leave as none for one price."
        >
          <select name="pageAltOfferId" defaultValue={offer?.pageAltOfferId ?? ""} className={input}>
            <option value="">&mdash; none, one price &mdash;</option>
            {offers
              .filter((o) => o.id !== offer?.id && (!offer || o.currency === offer.currency))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.interval ? ` — ${money(o.priceCents, o.currency)}/${o.interval}` : ""}
                  {o.active ? "" : " (draft)"}
                </option>
              ))}
          </select>
        </Field>

        {/* Its own copy and presentation (banner, bullets, accent) live on the
            Order bump screen linked at the top of this page — this is only
            which offer fills the slot. Restricted to one-time offers because a
            bump rides the host's own payment; a recurring one could only be
            charged afterwards, off-session, which cards issued in India
            refuse outright (see bumpSlotError). The filter here is a
            convenience so the list only ever offers something sellable —
            saveOffer refuses the same cases again regardless of what this
            posts.

            The CURRENT value stays in the list even when it fails that filter
            — deactivated, or switched to recurring, by an edit to THAT offer,
            not this one — and is labelled with what's now wrong. Dropping it
            instead would drop it from defaultValue too: a <select> can't
            select a value with no matching <option>, so the browser silently
            falls back to "none", and the NEXT save of this offer for any
            reason — a headline tweak — would then post that and erase a bump
            nobody touched. saveOffer only re-validates a bump when this posts
            a different id than the one already saved (see the comment there),
            so a stale-but-unchanged id round-tripping through here doesn't
            turn that unrelated save into a hard failure either. */}
        <Field
          label="Bump on this offer's checkout"
          hint="Shown as a tickbox on this offer's checkout and charged in the same payment as it. One-time offers only."
        >
          <select name="bumpOfferId" defaultValue={offer?.bumpOfferId ?? ""} className={input}>
            <option value="">&mdash; none, no bump &mdash;</option>
            {offers
              .filter(
                (o) =>
                  // No billing-type filter: a RECURRING bump is allowed — it
                  // takes nothing today and bills on its own subscription, the
                  // way the product checkout's bump always has. Only a
                  // one-time bump on a recurring host price is impossible, and
                  // that depends on which price the BUYER picks, so it is
                  // refused at checkout rather than hidden here.
                  o.id !== offer?.id && (o.active || o.id === offer?.bumpOfferId),
              )
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {money(o.priceCents, o.currency)}
                  {!o.active ? " (no longer active)" : ""}
                </option>
              ))}
          </select>
        </Field>

        {/* The one-time-offer page shown after THIS offer's own checkout —
            unlike the bump above, a RECURRING offer is a perfectly good
            upsell (see upsellSlotError): it is never folded into another
            payment, so there is no off-session-at-checkout problem for a
            recurring one to create. No one-time filter here on purpose.

            Same current-value safety net as the bump select, and for the
            same reason: dropping a disqualified value from the list drops it
            from defaultValue too, and the next unrelated save would silently
            erase it. saveOffer only re-validates an upsell when this posts a
            different id than the one already saved. */}
        <Field
          label="Upsell after this offer's checkout"
          hint="Shown as a one-time-offer page once this offer is paid for. Any active offer, including a recurring one."
        >
          <select name="upsellOfferId" defaultValue={offer?.upsellOfferId ?? ""} className={input}>
            <option value="">&mdash; none, no upsell &mdash;</option>
            {offers
              .filter((o) => o.id !== offer?.id && (o.active || o.id === offer?.upsellOfferId))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {money(o.priceCents, o.currency)}
                  {!o.active ? " (no longer available)" : ""}
                </option>
              ))}
          </select>
        </Field>

      </Section>
      </TabPanel>

      <TabPanel tab="marketing">
      <Section
        title="Ad reporting"
        hint="One pixel serves every funnel on the ad account. Name an event for this offer and it is reported on its own, beside the standard Purchase or StartTrial."
      >
        <Field
          label="Meta custom event name"
          hint="Fired when someone buys this offer — as a bump, an upsell, or on its own. Carries the offer's own name and what was actually charged. Leave blank to send nothing. Your ads team chooses the name; it must match theirs exactly."
        >
          <input
            name="adEventName"
            defaultValue={offer?.adEventName ?? ""}
            maxLength={40}
            placeholder="e.g. Funnel App Trial"
            className={input}
          />
        </Field>
        <Field
          label="Content name"
          hint="What Meta calls this offer in reporting and in any audience built on a purchase of it. Leave blank to use the offer name — set it only when your ads team already calls this something else."
        >
          <input
            name="contentName"
            defaultValue={offer?.contentName ?? ""}
            maxLength={100}
            placeholder={offer?.name || "e.g. Funnel App - Upsell"}
            className={input}
          />
        </Field>
      </Section>
      <Section
        title="ActiveCampaign"
        hint="Tags applied as someone moves through this offer. All take the numeric id, not the tag name."
      >
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
      </TabPanel>

      </EditorTabs>

      {state.error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.error}
        </p>
      )}

      {/* Away from Save, deliberately. */}
      <div className="flex items-center justify-end gap-4 border-t border-border pt-4">
        {offer && (
          <ConfirmSubmit
            label="Delete this offer"
            confirmLabel="Delete it, wherever it is attached"
            formAction={removeOffer}
          />
        )}
      </div>
    </form>
  );
}
