"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  saveOfferPageAction,
  type PageSaveState,
} from "@/app/admin/offers/[id]/content/actions";
import { OTO_CONTENT, defaultFor, type ContentField } from "@/lib/oto-content";
import { inputClass } from "@/components/admin/form-controls";

/**
 * Edit every line of copy on the bespoke upsell page.
 *
 * Two decisions shape this screen:
 *
 * Empty means default. Each box is pre-filled with what is live, and clearing
 * one restores the shipped copy — so there is no separate reset control, and
 * no way to end up with a blank section on a page a buyer sees after paying.
 *
 * The section names and numbers match the page top to bottom. Someone looking
 * at the live page and wanting to change "the bit above the price" should be
 * able to find it by counting, not by guessing which field maps where.
 */
export function OfferContentForm({
  offerId,
  values,
  previewHref,
}: {
  offerId: string;
  values: Record<string, string>;
  previewHref: string;
}) {
  const [state, action, pending] = useActionState<PageSaveState, FormData>(
    saveOfferPageAction,
    {},
  );
  const [current, setCurrent] = useState(values);

  const dirty = useMemo(
    () => Object.keys(current).some((k) => (current[k] ?? "") !== (values[k] ?? "")),
    [current, values],
  );

  const edited = (field: ContentField) => {
    const v = (current[field.key] ?? "").trim();
    return Boolean(v) && v !== defaultFor(field.key).trim();
  };
  const editedIn = (fields: ContentField[]) => fields.filter(edited).length;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="offerId" value={offerId} />

      {/* Sticky because the page is long: the save button should never be a
          scroll away from the field being typed into. */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save copy"}
        </button>
        <Link
          href={previewHref}
          target="_blank"
          className="rounded-full border border-border px-5 py-2.5 text-sm transition-colors hover:border-fg"
        >
          Preview page ↗
        </Link>
        <span className="text-sm text-muted" aria-live="polite">
          {state.error
            ? state.error
            : dirty
              ? "Unsaved changes"
              : state.saved
                ? "Saved. The live page is updated."
                : "Everything saved"}
        </span>
      </div>

      <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
        Each box holds what is on the page right now. Clear one to put the original wording back.
        Prices, the trial length and the countdown come from the offer itself, not from here — so
        the page can never advertise a price it does not charge.
      </p>

      {OTO_CONTENT.map((group) => {
        const count = editedIn(group.fields);
        return (
          <details
            key={group.id}
            className="group rounded-2xl border border-border bg-surface [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
              <span className="text-sm text-muted transition-transform group-open:rotate-90">▸</span>
              <span className="font-medium">{group.title}</span>
              {count > 0 && (
                <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs text-navy">
                  {count} edited
                </span>
              )}
              {group.hint && (
                <span className="ml-auto hidden text-sm text-muted sm:block">{group.hint}</span>
              )}
            </summary>

            <div className="flex flex-col gap-5 border-t border-border px-5 py-5">
              {group.fields.map((field) => (
                <label key={field.key} className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">
                    {field.label}
                    {field.hint && (
                      <span className="ml-2 font-normal text-muted">{field.hint}</span>
                    )}
                  </span>
                  {field.type === "text" ? (
                    <input
                      name={field.key}
                      defaultValue={values[field.key] ?? ""}
                      placeholder={field.default}
                      onChange={(e) =>
                        setCurrent((p) => ({ ...p, [field.key]: e.target.value }))
                      }
                      className={inputClass}
                    />
                  ) : (
                    <textarea
                      name={field.key}
                      defaultValue={values[field.key] ?? ""}
                      placeholder={field.default}
                      rows={field.type === "lines" ? Math.max(3, lineCount(field.default)) : 4}
                      onChange={(e) =>
                        setCurrent((p) => ({ ...p, [field.key]: e.target.value }))
                      }
                      className={`${inputClass} font-normal leading-relaxed`}
                    />
                  )}
                </label>
              ))}
            </div>
          </details>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save copy"}
        </button>
        {state.error && <span className="text-sm text-primary">{state.error}</span>}
      </div>
    </form>
  );
}

function lineCount(text: string) {
  return text.split("\n").length;
}
