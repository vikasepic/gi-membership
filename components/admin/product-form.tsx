"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveProduct, removeProduct, type SaveState } from "@/app/admin/actions";
import { inputClass, Field, Group } from "@/components/admin/form-controls";
import { EditorTabs, TabPanel } from "@/components/admin/editor-tabs";
import { EditorHeader } from "@/components/admin/editor-header";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { SaveStatus, useJustSaved, useSlowSave } from "@/components/admin/save-status";
import { PRODUCT_FIELD_TABS, summarise, tabToShow, tabsWithErrors } from "@/lib/save-feedback";
import { publicCoverUrl } from "@/lib/media-url";
import { MediaButton, type PickedMedia } from "@/components/admin/media-modal";
import { StorefrontPreview, BumpPreview, Readiness } from "@/components/admin/editor-preview";
import { slugify, slugDraft } from "@/lib/slug";
import { OfferPriceFields, type PriceUsage } from "@/components/admin/offer-price-fields";
import type { OfferPrice } from "@/lib/offer-prices";
import type { Product } from "@/lib/types";
import type { OfferOption } from "@/lib/admin";
import type { Course } from "@/lib/courses";

import { money } from "@/lib/money";
import { PricePicker } from "@/components/admin/price-picker";
const SLUG_RE = /^[a-z0-9-]+$/;

// Client-side checks for the fields with real rules, run before the form is ever
// submitted so a bad value is flagged inline with no round trip and no reload.
// The server re-validates and owns what the client can't know — whether the slug
// is already taken, and whether this product has a course to deliver.
// The price is no longer checked here: it is a row in the ways-to-pay list, and
// that list is validated by the same schema the offer editor uses — on the
// server, where the rules and the database CHECKs are written once.
function clientErrors(title: string, slug: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!title.trim()) e.title = "Title required";
  if (!slug.trim()) e.slug = "Slug required";
  else if (!SLUG_RE.test(slug)) e.slug = "Use lowercase letters, numbers and hyphens only";
  return e;
}

function invalid(cls: string, hasError: boolean) {
  return hasError ? `${cls} border-primary` : cls;
}

export function ProductForm({
  product,
  offers,
  allCourses,
  assignedCourseIds = [],
  coverUrl = null,
  inheritedCoverUrl = null,
  hasSalesPage = false,
  salesPageHref,
  liveHref,
  priceUsage = {},
}: {
  product?: Product;
  /** How many people are on each price, so one they are on cannot be repriced. */
  priceUsage?: PriceUsage;
  offers: OfferOption[];
  // Required, not defaulted. This used to default to [], which let the
  // new-product page omit it: the Content section then said "No courses yet"
  // while courses existed, and since publishing needs a course, no product
  // could be created at all. A silent default hid a hard dependency — the
  // compiler should refuse a page that forgets this list.
  allCourses: Course[];
  assignedCourseIds?: string[];
  /** For the preview — the picture a buyer will see. */
  coverUrl?: string | null;
  /** The attached course's, used when this product has none of its own. */
  inheritedCoverUrl?: string | null;
  salesPageHref?: string;
  liveHref?: string;
  /** Whether a sales page has actually been built for this product. */
  hasSalesPage?: boolean;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProduct, {});
  const [courseIds, setCourseIds] = useState<string[]>(assignedCourseIds);

  const [title, setTitle] = useState(product?.title ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [prices, setPrices] = useState<OfferPrice[]>(product?.prices ?? []);
  // Until someone edits the slug themselves it tracks the title. A saved product
  // already has a slug people may have linked to, so we never auto-touch that.
  const [slugEdited, setSlugEdited] = useState(Boolean(product));

  // Held here so each placement can say, as you pick, exactly what the buyer
  // will be shown.
  const [bumpOfferId, setBumpOfferId] = useState(product?.bumpOfferId ?? "");
  const [bumpAltOfferId] = useState(product?.bumpAltOfferId ?? "");
  const [bumpPriceIds, setBumpPriceIds] = useState<string[]>(product?.bumpPriceIds ?? []);
  const [upsellOfferId, setUpsellOfferId] = useState(product?.upsellOfferId ?? "");
  const [upsellAltOfferId] = useState(product?.upsellAltOfferId ?? "");
  const [upsellPriceIds, setUpsellPriceIds] = useState<string[]>(product?.upsellPriceIds ?? []);
  const [clientErr, setClientErr] = useState<Record<string, string>>({});
  // For the preview. Uncontrolled elsewhere, but the point of the preview is
  // that it moves as you type.
  const [tagline, setTagline] = useState(product?.tagline ?? "");
  const [status, setStatus] = useState(product?.status ?? "draft");
  // Whether there is anything to save. A save button that looks the same before
  // and after a change is a save button you press to find out.
  const [dirty, setDirty] = useState(false);
  // The cover posts with the form now rather than uploading on its own. Null
  // means untouched; a picked file replaces it, and "clear" falls back to the
  // attached course's picture.
  const [cover, setCover] = useState<PickedMedia | null>(null);
  const [coverCleared, setCoverCleared] = useState(false);
  const shownCover = coverCleared
    ? inheritedCoverUrl
    : (cover ? publicCoverUrl(cover.path) : coverUrl);

  // A field's own client error wins; otherwise fall back to the server's.
  // Editing clears the client error to "", so this must be `||` not `??` —
  // `??` treats "" as present and would hide the server error underneath.
  const err = (name: string) => clientErr[name] || state.errors?.[name];

  function toggleCourse(id: string) {
    setCourseIds((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
    setClientErr((c) => ({ ...c, courseIds: "" }));
  }

  function onTitle(v: string) {
    setTitle(v);
    setClientErr((c) => ({ ...c, title: "" }));
    if (!slugEdited) setSlug(slugify(v));
  }

  function onSlug(v: string) {
    // Normalised as they type, but with the trailing hyphen left alone —
    // trimming it here is what made a hyphen impossible to type at all. The
    // full rule runs on blur, and again on the server.
    setSlug(slugDraft(v));
    setSlugEdited(true);
    setClientErr((c) => ({ ...c, slug: "" }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Delete has its own action and must not be blocked by save-validation.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter?.dataset.action === "delete") return;

    const errs = clientErrors(title, slug);
    if (Object.keys(errs).length > 0) {
      e.preventDefault(); // stops the server action — no submit, no reload
      setClientErr(errs);
      // Bump the attempt so the tabs move to the first problem even if the same
      // field fails twice running.
      setAttempt((n) => n + 1);
    }
  }

  // The headline, as the database will mirror it: the first way to pay that is
  // showing. Derived rather than stored, so the header and the preview follow
  // the list while somebody is still editing it.
  const headline = prices.find((p) => !p.archived) ?? null;
  const price = headline ? (headline.priceCents / 100).toFixed(2) : "";

  const checks = [
    { ok: courseIds.length > 0, label: "Course attached", detail: "The library delivers courses — without one a buyer gets nothing." },
    { ok: prices.some((p) => !p.archived), label: "A way to pay", detail: "Every product needs at least one price that is showing." },
    { ok: Boolean(shownCover), label: "Cover image", detail: "The catalog card shows a plain gradient without one." },
    { ok: hasSalesPage, label: "Sales page built", detail: "Buyers land on the plain product page instead." },
    { ok: title.trim().length > 0 && slug.trim().length > 0, label: "Named and addressable" },
  ];
  const notReady = checks.filter((c) => !c.ok).length;
  // The offer that will actually be shown on the checkout, so the preview moves
  // when the bump is changed rather than describing the one saved last time.
  const bumpOffer = offers.find((o) => o.id === bumpOfferId) ?? null;

  // Everything wrong right now, from either side. The client's own check and
  // the server's answer are the same kind of thing to the person reading it.
  const allErrors = { ...state.errors, ...clientErr };
  const problem = summarise(allErrors);
  const badTabs = tabsWithErrors(allErrors, PRODUCT_FIELD_TABS, "basics");
  // Which tab to move to. Recomputed per attempt so pressing Save again after
  // fixing one field walks you to the next.
  const [attempt, setAttempt] = useState(0);
  const showTab = useMemo(
    () => tabToShow(allErrors, PRODUCT_FIELD_TABS, "", "basics"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempt],
  );

  const slow = useSlowSave(pending);
  const justSaved = useJustSaved(state.saved);
  useEffect(() => {
    // A save that worked has nothing left unsaved. Leaving the word on screen
    // is indistinguishable from a save that did not happen.
    if (state.saved) setDirty(false);
  }, [state.saved]);

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      onInput={() => setDirty(true)}
      className="flex flex-col gap-5"
      noValidate
    >
      {product && <input type="hidden" name="id" value={product.id} />}
      {courseIds.map((id) => (
        <input key={id} type="hidden" name="courseIds" value={id} />
      ))}

      {cover && <input type="hidden" name="mediaId" value={cover.id} />}
      {coverCleared && <input type="hidden" name="clearCover" value="1" />}

      <EditorHeader
        backHref="/admin"
        backLabel="Products"
        title={title || "New product"}
        meta={[slug && `/p/${slug}`, price && `$${price}`].filter(Boolean).join(" · ")}
        status={{
          live: status === "published",
          label: status === "published" ? "Published" : "Draft",
          note:
            status === "published"
              ? undefined
              : `/p/${slug} returns 404 to everyone until this is published.`,
        }}
        coverUrl={shownCover}
        onPickCover={(item) => {
          setCover(item);
          setCoverCleared(false);
          setDirty(true);
        }}
        links={
          <>
            {notReady > 0 && !problem && (
              <span className="text-xs text-primary">
                {notReady} to sort out
              </span>
            )}
            {/* Buttons, not muted text. These were two grey links the size of a
                caption sitting among captions — the two things somebody comes
                to this screen to do, styled as the least important words on it.
                "View" is offered whatever the status: a draft's address is
                where you go to SEE that it 404s, and hiding the way there is
                how somebody concludes the page is broken. */}
            {salesPageHref && (
              <a
                href={salesPageHref}
                className="rounded-lg border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary hover:text-fg"
              >
                Edit sales page
              </a>
            )}
            {liveHref && (
              <a
                href={liveHref}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  status === "published"
                    ? "Opens the live page in a new tab"
                    : "Opens in a new tab — a draft returns 404 until you publish it"
                }
                className="rounded-lg border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary hover:text-fg"
              >
                View page ↗
              </a>
            )}
          </>
        }
        dirty={dirty}
        pending={pending}
        saveLabel={product ? "Save" : "Create product"}
        saveStatus={
          <SaveStatus
            pending={pending}
            slow={slow}
            justSaved={justSaved}
            problem={problem}
            dirty={dirty}
          />
        }
      />

      {/* The one fact somebody needs on this screen, said where they are
          looking. The status was a word in the corner; this is what the word
          means. Gone the moment it is published — a banner that never goes
          away is a banner nobody reads. */}
      {status !== "published" && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-primary">
          <strong className="font-medium">This is a {status}.</strong>
          <span>
            <code className="font-mono text-[0.82em]">/p/{slug}</code> returns 404 to everyone,
            however finished the sales page is. Set Status to Published below to put it live.
          </span>
        </p>
      )}

      <EditorTabs
        showTab={showTab}
        tabs={[
          { key: "basics", label: "Basics", attention: badTabs.has("basics") },
          {
            key: "content",
            label: "Content",
            attention: badTabs.has("content") || courseIds.length === 0,
          },
          { key: "pricing", label: "Pricing", attention: badTabs.has("pricing") },
          { key: "funnel", label: "Funnel", attention: badTabs.has("funnel") || !hasSalesPage },
          { key: "marketing", label: "Marketing", attention: badTabs.has("marketing") },
        ]}
      >

      <TabPanel tab="basics">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="flex flex-col gap-6">
      <Group label="What you're selling" hint="How this appears on the storefront.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Title" required error={err("title")}>
            <input
              name="title"
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              className={invalid(inputClass, Boolean(err("title")))}
            />
          </Field>
          <Field label="Slug" required hint="lowercase-with-hyphens" error={err("slug")}>
            <input
              name="slug"
              value={slug}
              onChange={(e) => onSlug(e.target.value)}
              // The trailing hyphen is allowed while typing and tidied the
              // moment the field is left, so nothing half-written is saved.
              onBlur={(e) => setSlug(slugify(e.target.value))}
              className={invalid(inputClass, Boolean(err("slug")))}
            />
          </Field>
        </div>
        <Field label="Tagline" hint="one line under the title">
          <input
            name="tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea name="description" defaultValue={product?.description ?? ""} rows={4} className={inputClass} />
        </Field>
        {/* No type here — the storefront badge comes from the course this
            product grants. Type is a property of the content, not the price. */}
        {/* One line, not a card. The picture is in the header; this is the
            detail you only need while thinking about it. */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
          <span className="size-8 shrink-0 overflow-hidden rounded border border-border bg-surface">
            {shownCover && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={shownCover} alt="" className="size-full object-cover" />
            )}
          </span>
          <span className="text-muted">
            {coverCleared || (!cover && !coverUrl)
              ? "Using the attached course's picture."
              : "This product's own picture."}{" "}
            Best at 16:10 — 1600 × 1000.
          </span>
          <span className="ml-auto flex items-center gap-3">
            <MediaButton
              kind="image"
              label="Replace"
              onPick={(item) => {
                setCover(item);
                setCoverCleared(false);
                setDirty(true);
              }}
            />
            {(cover || coverUrl) && !coverCleared && (
              <button
                type="button"
                onClick={() => {
                  setCover(null);
                  setCoverCleared(true);
                  setDirty(true);
                }}
                className="text-muted hover:text-primary"
              >
                Use the course&rsquo;s
              </button>
            )}
          </span>
        </div>

        <Field label="Status" required error={err("status")}>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={inputClass}
          >
            <option value="draft">Draft — hidden from the store</option>
            <option value="published">Published</option>
          </select>
        </Field>
      </Group>
      </div>

      {/* The thing being written, where it will be read. A tagline is written to
          sit under a title in a card; writing it in a bare input is writing
          blind. */}
      <aside className="flex flex-col gap-5 lg:sticky lg:top-16 lg:self-start">
        <StorefrontPreview
          title={title}
          tagline={tagline}
          price={price}
          currency={product?.currency ?? "usd"}
          coverUrl={coverUrl}
        />
        {bumpOffer && (
          <BumpPreview
            headline={`Add ${bumpOffer.name}`}
            terms={
              bumpOffer.interval
                ? `${bumpOffer.trialDays ? `${bumpOffer.trialDays} days free, then ` : ""}${money(bumpOffer.priceCents, bumpOffer.currency)}/${bumpOffer.interval}`
                : money(bumpOffer.priceCents, bumpOffer.currency)
            }
          />
        )}
        <Readiness checks={checks} />
      </aside>
      </div>
      </TabPanel>

      <TabPanel tab="pricing">
      <Group
        label="Ways to pay"
        hint="One product, however many prices — a one-off, monthly, yearly, with or without a trial. The same model an offer uses, so a buyer's price is recorded the same way and a price somebody is on can be hidden but never repriced."
      >
        {/* The very same component the offer editor uses. A second price list
            that looked the same and behaved slightly differently is how one of
            them ends up letting somebody's billing change underneath them. */}
        <OfferPriceFields
          prices={product?.prices ?? []}
          currency={product?.currency ?? "usd"}
          name="prices"
          usage={priceUsage}
          onChange={setPrices}
        />
      </Group>
      </TabPanel>

      <TabPanel tab="content">
      <Group label="Content"
        hint="Which courses this unlocks. Tick several to sell a bundle. A published product needs at least one — the library delivers courses."
      >
        {/* There is deliberately no image field on a product. The storefront
            picture and the badge both come from the attached course, so one
            upload serves every product that sells it. Saying so here is the
            difference between "there's no image option" and knowing where it
            lives — the checkbox rows below flag any course still missing one. */}
        <p className="text-sm text-muted">
          The storefront image comes from the attached course, not from here — upload it on the
          course itself so every product selling that course shows the same picture.
        </p>

        {allCourses.length === 0 ? (
          <p className="text-sm text-muted">
            No courses yet — create one under Courses, then come back to attach it.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {allCourses.map((c) => {
              const ticked = courseIds.includes(c.id);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm"
                >
                  {/* Label wraps only the checkbox and title, so the edit link
                      beside it doesn't toggle the box when clicked. */}
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={ticked}
                      onChange={() => toggleCourse(c.id)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="flex-1">{c.title}</span>
                  </label>
                  {ticked && !c.coverPath && (
                    <span className="text-xs text-primary">no cover image</span>
                  )}
                  <span className="text-xs text-muted">
                    {c.status === "published" ? "Published" : "Draft"}
                  </span>
                  <a
                    href={`/admin/courses/${c.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit
                  </a>
                </div>
              );
            })}
          </div>
        )}
        {err("courseIds") && <p className="text-sm text-primary">{err("courseIds")}</p>}
      </Group>

      </TabPanel>

      <TabPanel tab="funnel">
      <Group
        label="On the checkout"
        hint="What the half beside the card fields says about this product."
      >
        <Field
          label="Line under the tagline"
          hint="Optional. The one thing worth saying to someone who already has their card out."
          error={err("checkoutNote")}
        >
          <input
            name="checkoutNote"
            defaultValue={product?.checkoutNote ?? ""}
            maxLength={240}
            placeholder="Delivered as a PDF you keep — no app, no login."
            className={inputClass}
          />
        </Field>
        <CheckoutBullets initial={product?.checkoutBullets ?? []} />
      </Group>

      <Group label="Upsells"
        hint="The bump shows on checkout. If it's declined, the upsell shows once, right after."
      >
        {/* Two selects per placement rather than one. A single select where
            picking the monthly offer silently produced two radio buttons was a
            form that could not be read — this says what a buyer will see. */}
        <div className="flex flex-col gap-5">
          <Placement
            label="Order bump"
            hint="on the checkout page"
            name="bumpOfferId"
            altName="bumpAltOfferId"
            offers={offers}
            offerId={bumpOfferId}
            onOffer={setBumpOfferId}
            altId={bumpAltOfferId}
            priceName="bumpPriceIds"
            priceIds={bumpPriceIds}
            onPrices={setBumpPriceIds}
            error={err("bumpOfferId")}
            single="A tick-box for this one price."
            both="A choice: the buyer picks one of the two, or No thanks."
          />
          <Placement
            label="Upsell (one-time offer)"
            hint="after checkout, if the bump was declined"
            name="upsellOfferId"
            altName="upsellAltOfferId"
            offers={offers}
            offerId={upsellOfferId}
            onOffer={setUpsellOfferId}
            altId={upsellAltOfferId}
            priceName="upsellPriceIds"
            priceIds={upsellPriceIds}
            onPrices={setUpsellPriceIds}
            error={err("upsellOfferId")}
            single="One button, one click."
            both="Two buttons side by side, one click each."
          />
        </div>
      </Group>
      </TabPanel>

      <TabPanel tab="marketing">
      <Group label="ActiveCampaign"
        hint="Buyers of this product are added to ActiveCampaign (or updated if they're already there) and given this tag."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Purchase tag ID"
            hint="Applied when someone buys this product. Removed if they are refunded."
            error={err("activecampaignTagId")}
          >
            <input
              name="activecampaignTagId"
              defaultValue={product?.activecampaignTagId ?? ""}
              inputMode="numeric"
              placeholder="e.g. 110"
              className={inputClass}
            />
          </Field>
          <Field
            label="Abandoned-cart tag ID"
            hint="Applied when checkout for this product starts, removed the moment it is paid. In ActiveCampaign: wait an hour, then check the tag is still there before sending."
            error={err("activecampaignAbandonedTagId")}
          >
            <input
              name="activecampaignAbandonedTagId"
              defaultValue={product?.activecampaignAbandonedTagId ?? ""}
              inputMode="numeric"
              placeholder="e.g. 111"
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Both take the <strong>numeric id</strong>, not the tag name — Contacts &rarr; Manage Tags,
          then read the id from the URL when editing a tag. Leave either empty for no tag.
        </p>
      </Group>
      </TabPanel>

      </EditorTabs>

      {state.errors?._form && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.errors._form}
        </p>
      )}

      {/* Delete stays at the foot, deliberately far from Save: they are not
          peers and should not be adjacent. */}
      <div className="flex items-center justify-end gap-4 border-t border-border pt-4">
        {product && !product.isPlaceholder && (
          <ConfirmSubmit
            label="Delete this product"
            confirmLabel="Delete it, and everything it sells"
            formAction={removeProduct}
          />
        )}
      </div>
    </form>
  );
}

/** "Funnel App - Yearly — $199/year". The interval, not a hardcoded "/mo". */
const offerLabel = (o: OfferOption) =>
  `${o.name} — ${money(o.priceCents, o.currency)}${o.interval ? `/${o.interval}` : ""}${o.active ? "" : " (draft)"}`;

/**
 * One place an offer can be shown, with an optional second price beside it.
 *
 * The summary line under it is the point: a form where choosing one offer
 * quietly changes a tick-box into a radio group is a form nobody can read.
 */
function Placement({
  label,
  hint,
  name,
  altName,
  offers,
  offerId,
  onOffer,
  altId,
  priceName,
  priceIds,
  onPrices,
  error,
  single,
  both,
}: {
  label: string;
  hint: string;
  name: string;
  altName: string;
  offers: OfferOption[];
  offerId: string;
  onOffer: (v: string) => void;
  altId: string;
  priceName: string;
  priceIds: string[];
  onPrices: (next: string[]) => void;
  error?: string;
  single: string;
  both: string;
}) {
  const chosen = offers.find((o) => o.id === offerId);
  const alt = offers.find((o) => o.id === altId);
  const price = (o: OfferOption) =>
    `${money(o.priceCents, o.currency)}${o.interval ? `/${o.interval}` : ""}`;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-4">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={label} hint={hint} error={error}>
          <select
            name={name}
            value={offerId}
            onChange={(e) => {
              onOffer(e.target.value);
              // An alternative left pointing at the offer that just became the
              // main one would render the same price twice.
              // The price ticks belong to the offer that was chosen, so
            // choosing a different one clears them rather than leaving a list
            // pointing at prices this placement can no longer resolve.
            if (e.target.value !== offerId) onPrices([]);
            }}
            className={inputClass}
          >
            <option value="">— none —</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>{offerLabel(o)}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Which of the chosen offer's prices this checkout shows.
          The "Second price" dropdown that stood here could only ever hold one,
          because it pointed at a whole second OFFER — the reason building a
          monthly and a yearly meant building two of everything. */}
      {chosen && chosen.prices.length > 0 && (
        <PricePicker
          label="Prices to show"
          hint="from the offer above"
          prices={chosen.prices}
          currency={chosen.currency}
          name={priceName}
          chosen={priceIds}
          onChange={onPrices}
        />
      )}

      {/* The old pairing, while it still exists. Shown rather than dropped:
          it is what the checkout is actually doing today, and silently
          ignoring it would change a live bump without saying so. */}
      {alt && (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          Still paired with <b className="font-medium text-fg">{alt.name}</b> as a
          second price — a separate offer, from before prices lived inside one.
          It keeps working until you tick prices above, which take over.
          <input type="hidden" name={altName} value={altId} />
        </p>
      )}

      {chosen && (
        <p className="text-sm text-muted">
          {alt ? (
            <>
              <b className="font-medium text-fg">
                {price(chosen)} or {price(alt)}
              </b>{" "}
              — {both}
            </>
          ) : (
            <>
              <b className="font-medium text-fg">{price(chosen)}</b> — {single}
            </>
          )}
        </p>
      )}
    </div>
  );
}


/**
 * The reassurance list beside the card fields.
 *
 * Empty leaves the three lines the checkout already shows — the card going
 * straight to Stripe, the refund window, and access on payment — and a fourth
 * only where Settings → Commerce has a reply time to promise. Those are true
 * of every product, and a product with nothing of its own to promise is better
 * served by them than by a blank column.
 *
 * The trial warning is not one of them and cannot be edited away: it is a
 * thing the buyer is agreeing to rather than a selling point, so the checkout
 * renders it outside this choice whether or not the list was replaced. It used
 * to be counted here as the fourth line, which made the number wrong in both
 * directions — a store with a reply time shows five.
 */
function CheckoutBullets({ initial }: { initial: string[] }) {
  const [lines, setLines] = useState<string[]>(initial.length > 0 ? initial : []);

  return (
    <Field
      label="Reassurance list"
      hint={
        lines.length === 0
          ? "What the checkout says beside the card fields today."
          : "These replace all of those. The trial warning stays either way."
      }
    >
      <div className="flex flex-col gap-2">
        {/* The standard lines, shown rather than described.
            This control read as a label with a link: "empty" means "use the
            standard ones", so no input existed until a button was pressed, and
            nothing said what pressing it would replace. A field with nothing in
            it looks broken rather than defaulted. */}
        {lines.length === 0 && (
          <ul className="flex list-disc flex-col gap-1 rounded-lg border border-dashed border-border py-2 pl-8 pr-3 text-xs text-muted">
            <li>Your card details go straight to Stripe. They never reach our servers.</li>
            <li>
              The refund window <span className="text-[0.68rem]">(from Settings &rarr; Legal)</span>
            </li>
            <li>Access opens the moment the payment clears &mdash; nothing to wait for.</li>
            <li>Your reply-time promise <span className="text-[0.68rem]">(only if Settings gives one)</span></li>
          </ul>
        )}
        {lines.map((line, i) => (
          <span key={i} className="flex items-center gap-2">
            <input
              name="checkoutBullets"
              value={line}
              onChange={(e) =>
                setLines((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))
              }
              maxLength={160}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              aria-label={`Remove line ${i + 1}`}
              className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs text-muted hover:border-primary hover:text-primary"
            >
              Remove
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, ""])}
          className="w-fit rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary"
        >
          {lines.length === 0 ? "Replace these" : "Add a line"}
        </button>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={() => setLines([])}
            className="w-fit text-xs text-muted underline-offset-2 hover:text-primary hover:underline"
          >
            Go back to the standard lines
          </button>
        )}
      </div>
    </Field>
  );
}
