"use client";

import { useActionState } from "react";
import { saveProduct, removeProduct, type SaveState } from "@/app/admin/actions";
import { inputClass as input, Field } from "@/components/admin/form-controls";
import type { Product } from "@/lib/types";
import type { OfferOption } from "@/lib/admin";

const money = (c: number) => `$${(c / 100).toFixed(0)}`;

export function ProductForm({
  product,
  offers,
}: {
  product?: Product;
  offers: OfferOption[];
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProduct, {});

  const offerLabel = (o: OfferOption) =>
    `${o.name} — ${money(o.priceCents)}${o.billingType === "recurring" ? "/mo" : ""}`;

  return (
    <form action={action} className="flex flex-col gap-6">
      {product && <input type="hidden" name="id" value={product.id} />}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Title" required>
          <input name="title" defaultValue={product?.title ?? ""} required className={input} />
        </Field>
        <Field label="Slug" required hint="lowercase-with-hyphens">
          <input name="slug" defaultValue={product?.slug ?? ""} required className={input} />
        </Field>
      </div>

      <Field label="Tagline">
        <input name="tagline" defaultValue={product?.tagline ?? ""} className={input} />
      </Field>

      <Field label="Description">
        <textarea name="description" defaultValue={product?.description ?? ""} rows={4} className={input} />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Type" required>
          <select name="type" defaultValue={product?.type ?? "pdf"} className={input}>
            <option value="pdf">PDF / Guide</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
            <option value="app">App</option>
            <option value="course">Course</option>
          </select>
        </Field>
        <Field label="Price ($)" required>
          <input
            name="price"
            type="number"
            min="0"
            step="1"
            defaultValue={product ? product.priceCents / 100 : ""}
            required
            className={input}
          />
        </Field>
        <Field label="Compare-at ($)" hint="optional anchor">
          <input
            name="compareAt"
            type="number"
            min="0"
            step="1"
            defaultValue={product?.compareAtCents ? product.compareAtCents / 100 : ""}
            className={input}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Status" required>
          <select name="status" defaultValue={product?.status ?? "draft"} className={input}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </Field>
        <Field label="Media mode">
          <select name="mediaMode" defaultValue={product?.mediaMode ?? ""} className={input}>
            <option value="">— none —</option>
            <option value="upload">Upload (PDF/audio)</option>
            <option value="embed">Embed (video URL)</option>
          </select>
        </Field>
        <Field label="Embed URL" hint="Vimeo/YouTube (embed mode)">
          <input name="mediaEmbedUrl" defaultValue={product?.mediaEmbedUrl ?? ""} className={input} />
        </Field>
      </div>

      <Field label="Cover image URL" hint="optional">
        <input name="coverImageUrl" defaultValue={product?.coverImageUrl ?? ""} className={input} />
      </Field>

      {/* Offer slots — the reusable offer library attached per product. */}
      <fieldset className="flex flex-col gap-5 rounded-2xl border border-border p-5">
        <legend className="kicker px-2 text-muted">Offer slots</legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Order bump" hint="shown on checkout">
            <select name="bumpOfferId" defaultValue={product?.bumpOfferId ?? ""} className={input}>
              <option value="">— none —</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{offerLabel(o)}</option>
              ))}
            </select>
          </Field>
          <Field label="Upsell (OTO)" hint="shown if bump declined">
            <select name="upsellOfferId" defaultValue={product?.upsellOfferId ?? ""} className={input}>
              <option value="">— none —</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{offerLabel(o)}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Call chapters" hint="e.g. Module, Week, Part">
            <input name="chapterLabel" defaultValue={product?.chapterLabel ?? "Chapter"} className={input} />
          </Field>
          <Field label="Call lessons" hint="e.g. Session, Day, Video">
            <input name="lessonLabel" defaultValue={product?.lessonLabel ?? "Lesson"} className={input} />
          </Field>
        </div>
      </fieldset>

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
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </button>

        {product && !product.isPlaceholder && (
          <button
            type="submit"
            formAction={removeProduct}
            className="text-sm text-muted hover:text-primary"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

