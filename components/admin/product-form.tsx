"use client";

import { useActionState, useState } from "react";
import { saveProduct, removeProduct, type SaveState } from "@/app/admin/actions";
import { inputClass, Field, Section } from "@/components/admin/form-controls";
import { slugify } from "@/lib/slug";
import type { Product } from "@/lib/types";
import type { OfferOption } from "@/lib/admin";
import type { Course } from "@/lib/courses";

const money = (c: number) => `$${(c / 100).toFixed(0)}`;
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
  allCourses = [],
  assignedCourseIds = [],
}: {
  product?: Product;
  offers: OfferOption[];
  allCourses?: Course[];
  assignedCourseIds?: string[];
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProduct, {});
  const [courseIds, setCourseIds] = useState<string[]>(assignedCourseIds);

  const [title, setTitle] = useState(product?.title ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [price, setPrice] = useState(product ? String(product.priceCents / 100) : "");
  // Until someone edits the slug themselves it tracks the title. A saved product
  // already has a slug people may have linked to, so we never auto-touch that.
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [clientErr, setClientErr] = useState<Record<string, string>>({});

  // A field's own client error wins; otherwise fall back to the server's.
  // Editing clears the client error to "", so this must be `||` not `??` —
  // `??` treats "" as present and would hide the server error underneath.
  const err = (name: string) => clientErr[name] || state.errors?.[name];

  const offerLabel = (o: OfferOption) =>
    `${o.name} — ${money(o.priceCents)}${o.billingType === "recurring" ? "/mo" : ""}`;

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

  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {product && <input type="hidden" name="id" value={product.id} />}
      {courseIds.map((id) => (
        <input key={id} type="hidden" name="courseIds" value={id} />
      ))}

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
          <input name="tagline" defaultValue={product?.tagline ?? ""} className={inputClass} />
        </Field>
        <Field label="Description">
          <textarea name="description" defaultValue={product?.description ?? ""} rows={4} className={inputClass} />
        </Field>
        {/* No type here — the storefront badge comes from the course this
            product grants. Type is a property of the content, not the price. */}
        <Field label="Status" required error={err("status")}>
          <select name="status" defaultValue={product?.status ?? "draft"} className={inputClass}>
            <option value="draft">Draft — hidden from the store</option>
            <option value="published">Published</option>
          </select>
        </Field>
      </Section>

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

      <Section
        title="Content"
        hint="Which courses this unlocks. Tick several to sell a bundle. A published product needs at least one — the library delivers courses."
      >
        {allCourses.length === 0 ? (
          <p className="text-sm text-muted">
            No courses yet — create one under Courses, then come back to attach it.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {allCourses.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={courseIds.includes(c.id)}
                  onChange={() => toggleCourse(c.id)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="flex-1">{c.title}</span>
                <span className="text-xs text-muted">
                  {c.status === "published" ? "Published" : "Draft"}
                </span>
              </label>
            ))}
          </div>
        )}
        {err("courseIds") && <p className="text-sm text-primary">{err("courseIds")}</p>}
      </Section>

      <Section
        title="Upsells"
        hint="The bump shows on checkout. If it's declined, the upsell shows once, right after."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Order bump" hint="on the checkout page" error={err("bumpOfferId")}>
            <select name="bumpOfferId" defaultValue={product?.bumpOfferId ?? ""} className={inputClass}>
              <option value="">— none —</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{offerLabel(o)}</option>
              ))}
            </select>
          </Field>
          <Field label="Upsell (one-time offer)" hint="after checkout, if the bump was declined" error={err("upsellOfferId")}>
            <select name="upsellOfferId" defaultValue={product?.upsellOfferId ?? ""} className={inputClass}>
              <option value="">— none —</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{offerLabel(o)}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {state.errors?._form && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.errors._form}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : product ? "Save product" : "Create product"}
        </button>

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
