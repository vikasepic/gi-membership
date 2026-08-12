"use client";

import { useActionState, useState } from "react";
import { savePageSettingsAction } from "@/app/admin/pages/actions";
import { SnippetFields } from "@/components/admin/snippet-fields";
import type { CodeSnippet } from "@/lib/code-snippets";
import type { OwnerType } from "@/lib/pages";

// Page-level custom code.
//
// Collapsed by default. It is not part of writing a sales page — it is the
// escape hatch for the one thing the controls cannot express — and an open
// pair of code boxes above the sections would suggest otherwise.

const box =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed";

export function PageSettings({
  ownerType,
  ownerId,
  customCss,
  customJs,
  snippets,
}: {
  ownerType: OwnerType;
  ownerId: string;
  customCss: string;
  customJs: string;
  /** This page's own snippets — same list, same shape, as the store-wide one. */
  snippets: CodeSnippet[];
}) {
  const [state, action, pending] = useActionState(savePageSettingsAction, {});
  const [open, setOpen] = useState(false);
  const has =
    customCss.trim().length > 0 ||
    customJs.trim().length > 0 ||
    snippets.some((x) => x.code.trim() !== "");

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <span className="font-medium">Custom code</span>
        <span className="text-sm text-muted">
          {has ? "CSS, JS and snippets for this page" : "None — CSS, JS and snippets for this page"}
        </span>
        <span aria-hidden className="ml-auto text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <form action={action} className="flex flex-col gap-4 border-t border-border px-5 py-4">
          <input type="hidden" name="ownerType" value={ownerType} />
          <input type="hidden" name="ownerId" value={ownerId} />

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">CSS</span>
            <span className="text-xs text-muted">
              Applies to this page only. For one block, use its own Custom CSS under Advanced.
            </span>
            <textarea name="customCss" rows={6} defaultValue={customCss} className={box} spellCheck={false} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">JavaScript</span>
            {/* Said plainly, at the box, because this is the one control on the
                page whose blast radius is the checkout rather than the layout. */}
            <span className="text-xs text-muted">
              Runs on the live page, which leads to checkout. No <code>&lt;script&gt;</code> tags —
              the code itself.
            </span>
            <textarea name="customJs" rows={6} defaultValue={customJs} className={box} spellCheck={false} />
          </label>

          {/* The same list the store-wide settings use, scoped to this page.
              This is where a `<script>` tag goes: the box above is the inside
              of a script element, so a tag typed there is not JavaScript. */}
          <SnippetFields snippets={snippets} />

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save custom code"}
            </button>
            {state.error && <span className="text-sm text-primary">{state.error}</span>}
            {state.saved && !state.error && <span className="text-sm text-muted">Saved.</span>}
          </div>
        </form>
      )}
    </div>
  );
}
