"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { inputClass as input, Field } from "@/components/admin/form-controls";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import {
  installGoogleFontAction,
  uploadFontAction,
  removeFontAction,
  type FontState,
} from "@/app/admin/settings/font-actions";
import { GOOGLE_FONTS, FONT_WEIGHTS } from "@/lib/fonts-catalogue";

/**
 * Which typefaces the store uses, and which it has.
 *
 * Two halves. The top one is the decision — heading and body — and it only
 * offers what is actually installed, because a family name with no files
 * behind it silently renders as the fallback and looks like a bug in the page
 * rather than a gap in the settings.
 *
 * The bottom half is the library. A Google font is DOWNLOADED when it is
 * chosen and served from this site afterwards, so no visitor's browser ever
 * talks to Google — that is a privacy commitment, not a speed trick, and the
 * panel says so rather than leaving it to be discovered.
 */
export type InstalledFont = { id: string; family: string; source: "google" | "custom"; count: number };

export function TypographyFields({
  headingFont,
  bodyFont,
  installed,
  errors,
}: {
  headingFont: string;
  bodyFont: string;
  installed: InstalledFont[];
  errors: Record<string, string>;
}) {
  const families = installed.map((f) => f.family);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Heading font" hint="titles, and anything set in the display face" error={errors.headingFont}>
          <FontSelect name="headingFont" value={headingFont} families={families} />
        </Field>
        <Field label="Body font" hint="paragraphs, labels, buttons" error={errors.bodyFont}>
          <FontSelect name="bodyFont" value={bodyFont} families={families} />
        </Field>
      </div>

    </>
  );
}

function FontSelect({
  name,
  value,
  families,
}: {
  name: string;
  value: string;
  families: string[];
}) {
  return (
    <select name={name} defaultValue={value} className={input}>
      <option value="">Built in — the font this site ships with</option>
      {families.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  );
}

/**
 * The library, rendered OUTSIDE the settings group's form.
 *
 * Adding a font and removing one are forms of their own, and a form inside a
 * form is not a thing HTML has — the inner one is dropped and its button
 * submits the outer one, which would save the settings group instead of
 * uploading the file.
 */
export function FontLibrary({ installed }: { installed: InstalledFont[] }) {
  const [tab, setTab] = useState<"google" | "custom">("google");

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="kicker text-muted">Fonts on this site</span>
        <p className="text-xs text-muted">
          Served from this site, never from Google — so no visitor&rsquo;s browser is handed to a
          third party before your cookie banner has said a word.
        </p>
      </div>

      {installed.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {installed.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm" style={{ fontFamily: `"${f.family}", inherit` }}>
                  {f.family}
                </span>
                <span className="text-[0.66rem] text-muted">
                  {f.source === "google" ? "Google, self-hosted" : "Uploaded"} · {f.count} file
                  {f.count === 1 ? "" : "s"}
                </span>
              </span>
              <form action={removeFontAction}>
                <input type="hidden" name="id" value={f.id} />
                <ConfirmSubmit
                  label="Remove"
                  confirmLabel="Remove — any page using it falls back"
                  cancelLabel="Keep it"
                  kind="remove"
                />
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          Nothing added yet, so the site uses the two fonts it was built with.
        </p>
      )}

      <div className="flex gap-1 border-b border-border" role="tablist">
        {(
          [
            ["google", "Add a Google font"],
            ["custom", "Upload your own"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-3 py-1.5 text-xs transition-colors ${
              tab === key ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "google" ? <AddGoogle /> : <AddCustom />}
    </div>
  );
}

function AddGoogle() {
  const [state, action] = useActionState<FontState, FormData>(installGoogleFontAction, {});
  return (
    /* Its own form, nested nowhere: the settings group around this is a form
       too, and a form inside a form is not a thing HTML has. */
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
        <span className="text-xs text-muted">Family</span>
        <select name="family" className={input} defaultValue="">
          <option value="" disabled>
            Choose a font…
          </option>
          {GOOGLE_FONTS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Submit label="Download it" busy="Downloading…" />
      <Result state={state} />
    </form>
  );
}

function AddCustom() {
  const [state, action] = useActionState<FontState, FormData>(uploadFontAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs text-muted">Family name</span>
          <input name="family" placeholder="Founders Grotesk" className={input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Weight</span>
          <select name="weight" defaultValue="400" className={input}>
            {[100, 200, 300, ...FONT_WEIGHTS, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Style</span>
          <select name="style" defaultValue="normal" className={input}>
            <option value="normal">Upright</option>
            <option value="italic">Italic</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">File</span>
        <input type="file" name="file" accept=".woff2,.woff,.ttf,.otf" className={input} />
      </label>
      <p className="text-[0.66rem] text-muted">
        One file per weight and style. Add the same family again for each one — bold and italic are
        separate files, and a browser asked for a bold it does not have will smear the regular
        instead.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Add the file" busy="Uploading…" />
        <Result state={state} />
      </div>
    </form>
  );
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:border-primary disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  );
}

function Result({ state }: { state: FontState }) {
  if (state.error) {
    return (
      <span role="alert" className="text-xs text-primary">
        {state.error}
      </span>
    );
  }
  if (state.message) {
    return (
      <span role="status" className="text-xs text-navy">
        {state.message}
      </span>
    );
  }
  return null;
}
