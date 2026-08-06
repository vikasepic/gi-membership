"use client";

import { useActionState, useState } from "react";
import { saveProduct, removeProduct, type SaveState } from "@/app/admin/actions";
import { inputClass, Field, Section } from "@/components/admin/form-controls";
import { EditorTabs, TabPanel } from "@/components/admin/editor-tabs";
import { StorefrontPreview, BumpPreview, Readiness } from "@/components/admin/editor-preview";
import { slugify } from "@/lib/slug";
import type { Product } from "@/lib/types";
import type { OfferOption } from "@/lib/admin";
import type { Course } from "@/lib/courses";

import { money } from "@/lib/money";
const SLUG_RE = /^[a-z0-9-]+$/;

// Client-side checks for the fields with real rules, run before the form is ever
// submitted so a bad value is flagged inline with no round trip and no reload.
// The server re-validates and owns what the client can't know — whether the slug
// is already taken, and whether this product has a course to deliver.
function clientErrors(title: string, slug: string, price: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!title.trim()) e.title = "Title required";
  if (!slug.trim()) e.slug = "Slug required";
  else if (!SLUG_RE.test(slug)) e.slug = "Use lowercase letters, numbers and hyphens only";
  if (price.trim() === "") e.price = "Price required";
  else if (!Number.isFinite(Number(price)) || Number(price) < 0) e.price = "Price must be 0 or more";
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
  hasSalesPage = false,
}: {
  product?: Product;
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
  /** Whether a sales page has actually been built for this product. */
  hasSalesPage?: boolean;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProduct, {});
  const [courseIds, setCourseIds] = useState<string[]>(assignedCourseIds);

  const [title, setTitle] = useState(product?.title ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [price, setPrice] = useState(product ? String(product.priceCents / 100) : "");
  // Until someone edits the slug themselves it tracks the title. A saved product
  // already has a slug people may have linked to, so we never auto-touch that.
  const [slugEdited, setSlugEdited] = useState(Boolean(product));

  // Held here so each placement can say, as you pick, exactly what the buyer
  // will be shown.
  const [bumpOfferId, setBumpOfferId] = useState(product?.bumpOfferId ?? "");
  const [bumpAltOfferId, setBumpAltOfferId] = useState(product?.bumpAltOfferId ?? "");
  const [upsellOfferId, setUpsellOfferId] = useState(product?.upsellOfferId ?? "");
  const [upsellAltOfferId, setUpsellAltOfferId] = useState(product?.upsellAltOfferId ?? "");
  const [clientErr, setClientErr] = useState<Record<string, string>>({});
  // For the preview. Uncontrolled elsewhere, but the point of the preview is
  // that it moves as you type.
  const [tagline, setTagline] = useState(product?.tagline ?? "");
  const [status, setStatus] = useState(product?.status ?? "draft");
  // Whether there is anything to save. A save button that looks the same before
  // and after a change is a save button you press to find out.
  const [dirty, setDirty] = useState(false);

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
    // Normalise as they type so the field can only hold a valid slug.
    setSlug(slugify(v));
    setSlugEdited(true);
    setClientErr((c) => ({ ...c, slug: "" }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Delete has its own action and must not be blocked by save-validation.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter?.dataset.action === "delete") return;

    const errs = clientErrors(title, slug, price);
    if (Object.keys(errs).length > 0) {
      e.preventDefault(); // stops the server action — no submit, no reload
      setClientErr(errs);
    }
  }

  const checks = [
    { ok: courseIds.length > 0, label: "Course attached", detail: "The library delivers courses — without one a buyer gets nothing." },
    { ok: price.trim() !== "" && Number(price) >= 0, label: "Price set" },
    { ok: Boolean(coverUrl), label: "Cover image", detail: "The catalog card shows a plain gradient without one." },
    { ok: hasSalesPage, label: "Sales page built", detail: "Buyers land on the plain product page instead." },
    { ok: title.trim().length > 0 && slug.trim().length > 0, label: "Named and addressable" },
  ];
  const notReady = checks.filter((c) => !c.ok).length;
  // The offer that will actually be shown on the checkout, so the preview moves
  // when the bump is changed rather than describing the one saved last time.
  const bumpOffer = offers.find((o) => o.id === bumpOfferId) ?? null;

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

      {/* Sticky, because the save button used to be two thousand pixels below
          the field you had just changed. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-b border-border bg-bg/95 px-1 py-2.5 backdrop-blur">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${status === "published" ? "bg-[#3f9b6d]" : "bg-border"}`}
          />
          <span className="text-sm text-muted">{status === "published" ? "Published" : "Draft"}</span>
        </span>
        {notReady > 0 && (
          <span className="text-xs text-primary">
            {notReady} thing{notReady === 1 ? "" : "s"} to sort out
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {dirty && <span className="text-xs text-primary">Unsaved</span>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : product ? "Save" : "Create product"}
          </button>
        </span>
      </div>

      <EditorTabs
        tabs={[
          { key: "basics", label: "Basics" },
          { key: "content", label: "Content", attention: courseIds.length === 0 },
          { key: "pricing", label: "Pricing" },
          { key: "funnel", label: "Funnel", attention: !hasSalesPage },
          { key: "marketing", label: "Marketing" },
        ]}
      >

      <TabPanel tab="basics">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="flex flex-col gap-6">
      <Section title="What you're selling" hint="How this appears on the storefront.">
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
      </Section>
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
      <Section
        title="Pricing"
        hint="One-time price for this product. Subscriptions live in Offers, not here."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Price ($)" required error={err("price")}>
            <input
              name="price" type="number" min="0" step="0.01"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setClientErr((c) => ({ ...c, price: "" }));
              }}
              className={invalid(inputClass, Boolean(err("price")))}
            />
          </Field>
          <Field label="Compare-at ($)" hint="shown struck through, for anchoring" error={err("compareAt")}>
            <input
              name="compareAt" type="number" min="0" step="0.01"
              defaultValue={product?.compareAtCents ? product.compareAtCents / 100 : ""}
              className={invalid(inputClass, Boolean(err("compareAt")))}
            />
          </Field>
        </div>
      </Section>
      </TabPanel>

      <TabPanel tab="content">
      <Section
        title="Content"
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
      </Section>
      </TabPanel>

      <TabPanel tab="funnel">
      <Section
        title="Upsells"
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
            onAlt={setBumpAltOfferId}
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
            onAlt={setUpsellAltOfferId}
            error={err("upsellOfferId")}
            single="One button, one click."
            both="Two buttons side by side, one click each."
          />
        </div>
      </Section>
      </TabPanel>

      <TabPanel tab="marketing">
      <Section
        title="ActiveCampaign"
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
      </Section>
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
          <button
            type="submit"
            formAction={removeProduct}
            data-action="delete"
            className="text-sm text-muted hover:text-fg"
          >
            Delete
          </button>
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
  onAlt,
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
  onAlt: (v: string) => void;
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
              if (!e.target.value || e.target.value === altId) onAlt("");
            }}
            className={inputClass}
          >
            <option value="">— none —</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>{offerLabel(o)}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Second price"
          hint={offerId ? "optional — leave empty for one price" : "pick an offer first"}
        >
          <select
            name={altName}
            value={altId}
            onChange={(e) => onAlt(e.target.value)}
            disabled={!offerId}
            className={`${inputClass} disabled:opacity-50`}
          >
            <option value="">— none, one price —</option>
            {offers
              // Same currency only. Two prices side by side in different
              // currencies is a choice nobody can make.
              .filter((o) => o.id !== offerId && (!chosen || o.currency === chosen.currency))
              .map((o) => (
                <option key={o.id} value={o.id}>{offerLabel(o)}</option>
              ))}
          </select>
        </Field>
      </div>

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
