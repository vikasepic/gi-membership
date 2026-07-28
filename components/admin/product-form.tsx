"use client";

import { useActionState, useState } from "react";
import { saveProduct, removeProduct, type SaveState } from "@/app/admin/actions";
import { inputClass as input, Field, Section } from "@/components/admin/form-controls";
import type { Product } from "@/lib/types";
import type { OfferOption } from "@/lib/admin";
import type { Course } from "@/lib/courses";

const money = (c: number) => `$${(c / 100).toFixed(0)}`;

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

  const offerLabel = (o: OfferOption) =>
    `${o.name} — ${money(o.priceCents)}${o.billingType === "recurring" ? "/mo" : ""}`;

  const toggleCourse = (id: string) =>
    setCourseIds((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));

  return (
    <form action={action} className="flex flex-col gap-6">
      {product && <input type="hidden" name="id" value={product.id} />}
      {courseIds.map((id) => (
        <input key={id} type="hidden" name="courseIds" value={id} />
      ))}

      <Section title="What you're selling" hint="How this appears on the storefront.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Title" required>
            <input name="title" defaultValue={product?.title ?? ""} required className={input} />
          </Field>
          <Field label="Slug" required hint="lowercase-with-hyphens">
            <input name="slug" defaultValue={product?.slug ?? ""} required className={input} />
          </Field>
        </div>
        <Field label="Tagline" hint="one line under the title">
          <input name="tagline" defaultValue={product?.tagline ?? ""} className={input} />
        </Field>
        <Field label="Description">
          <textarea name="description" defaultValue={product?.description ?? ""} rows={4} className={input} />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Badge type" hint="storefront label only">
            <select name="type" defaultValue={product?.type ?? "course"} className={input}>
              <option value="course">Course</option>
              <option value="pdf">PDF / Guide</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
              <option value="app">App</option>
            </select>
          </Field>
          <Field label="Status" required>
            <select name="status" defaultValue={product?.status ?? "draft"} className={input}>
              <option value="draft">Draft — hidden from the store</option>
              <option value="published">Published</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section
        title="Pricing"
        hint="One-time price for this product. Subscriptions live in Offers, not here."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Price ($)" required>
            <input
              name="price" type="number" min="0" step="1"
              defaultValue={product ? product.priceCents / 100 : ""}
              required className={input}
            />
          </Field>
          <Field label="Compare-at ($)" hint="shown struck through, for anchoring">
            <input
              name="compareAt" type="number" min="0" step="1"
              defaultValue={product?.compareAtCents ? product.compareAtCents / 100 : ""}
              className={input}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Content"
        hint="Which courses this unlocks. Tick several to sell a bundle, or none for a simple one-file product."
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
      </Section>

      <Section
        title="Upsells"
        hint="The bump shows on checkout. If it's declined, the upsell shows once, right after."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Order bump" hint="on the checkout page">
            <select name="bumpOfferId" defaultValue={product?.bumpOfferId ?? ""} className={input}>
              <option value="">— none —</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{offerLabel(o)}</option>
              ))}
            </select>
          </Field>
          <Field label="Upsell (one-time offer)" hint="after checkout, if the bump was declined">
            <select name="upsellOfferId" defaultValue={product?.upsellOfferId ?? ""} className={input}>
              <option value="">— none —</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{offerLabel(o)}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

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
          {pending ? "Saving…" : product ? "Save product" : "Create product"}
        </button>

        {product && !product.isPlaceholder && (
          <button type="submit" formAction={removeProduct} className="text-sm text-muted hover:text-fg">
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
