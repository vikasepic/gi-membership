"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MediaButton, type PickedMedia } from "@/components/admin/media-modal";
import { publicCoverUrl } from "@/lib/media-url";
import { inputClass as input, Field } from "@/components/admin/form-controls";
import { useSlowSave, useJustSaved } from "@/components/admin/save-status";
import { saveSettingsGroup, type SaveState } from "@/app/admin/settings/actions";
import { GROUP_FIELDS, SETTINGS_GROUPS, type Settings, type SettingsGroupKey } from "@/lib/settings-schema";
import { usePresence, PresenceNote } from "@/components/admin/presence";
import { TypographyFields, FontLibrary, type InstalledFont } from "@/components/admin/typography-fields";

/**
 * Site settings, in groups.
 *
 * Thirty-odd fields in one column is a page you scroll past. Six groups, each
 * answerable in a sitting, and a marker on the one with something missing —
 * which is how the legal fields get found by someone who does not already know
 * they are the problem.
 *
 * **Each group is its own form**, and only the open one is mounted. That is the
 * opposite of the product editor, where the tabs share a single form and the
 * panels must stay mounted or their fields never post. Here a save is scoped to
 * one group by design: a field that is not on screen must not be written, so
 * leaving five groups untouched is a thing you can do.
 */
export function SettingsScreen({
  settings,
  legalPlaceholders,
  fonts = [],
}: {
  settings: Settings;
  legalPlaceholders: string[];
  /** What is installed, for the Typography group's two selects and its library. */
  fonts?: InstalledFont[];
}) {
  const [open, setOpen] = useState<SettingsGroupKey>("legal");

  // Only a group with something genuinely actionable gets a marker. A dot on
  // everything is a dot on nothing.
  const attention: Partial<Record<SettingsGroupKey, string>> = {
    legal: legalPlaceholders.length > 0 ? legalPlaceholders.join(", ") : undefined,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="font-display text-xl">Site settings</h1>
          <p className="text-sm text-muted">Everything that is true of the whole store.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-[11rem_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface-2 p-2 md:flex-col md:gap-0 md:overflow-visible md:border-b-0 md:border-r md:py-2">
          {SETTINGS_GROUPS.map((g) => {
            const on = open === g.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setOpen(g.key)}
                aria-current={on ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors md:rounded-none ${
                  on
                    ? "bg-surface font-medium text-primary md:shadow-[inset_2px_0_0_var(--primary)]"
                    : "text-muted hover:text-fg"
                }`}
              >
                {g.label}
                {attention[g.key] && (
                  <span
                    aria-label="needs attention"
                    className="ml-auto size-1.5 shrink-0 rounded-full bg-primary"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-4 p-5">
          <GroupForm
            key={open}
            group={open}
            settings={settings}
            attention={attention[open]}
            fonts={fonts}
          />
          {/* Outside the form on purpose — see FontLibrary. */}
          {open === "typography" && <FontLibrary installed={fonts} />}
        </div>
      </div>

      <p className="text-xs text-muted">
        Stripe keys, the database service key, the webhook and cron secrets and the admin email
        list stay in the server environment on purpose — a secret editable from a page a stolen
        admin session can reach has a shorter life than you think, and the admin list is
        deliberately the one thing this page cannot change, so a mistake here can never lock
        everyone out.
      </p>
    </div>
  );
}

function GroupForm({
  group,
  settings,
  attention,
  fonts,
}: {
  group: SettingsGroupKey;
  settings: Settings;
  attention?: string;
  fonts: InstalledFont[];
}) {
  const [state, action] = useActionState<SaveState, FormData>(saveSettingsGroup, {});
  const errors = state.group === group ? (state.errors ?? {}) : {};
  const justSaved = useJustSaved(state.group === group && state.saved);

  // Per group, not per page: two people on Legal and Brand are not in each
  // other's way, and warning them they are teaches everyone to ignore it.
  const editors = usePresence("settings", group);

  // What this form was rendered from. Sent back so the save can tell the
  // difference between "you changed this" and "somebody else did".
  const baseline = JSON.stringify(
    Object.fromEntries(
      (GROUP_FIELDS[group] ?? []).map((f) => [f, (settings as unknown as Record<string, unknown>)[f as string]]),
    ),
  );

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="_group" value={group} />
      <input type="hidden" name="_baseline" value={baseline} />

      <PresenceNote editors={editors} what="these settings" className="w-fit" />

      {attention && group === "legal" && (
        <p className="rounded-r-lg border-l-2 border-primary bg-primary/5 px-3 py-2 text-xs text-primary">
          Still unset: {attention}. Your terms page is showing a draft warning to buyers because
          of it.
        </p>
      )}

      {errors._form && (
        <p role="alert" className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {errors._form}
        </p>
      )}

      {group === "legal" && <LegalFields s={settings} errors={errors} />}
      {group === "identity" && <IdentityFields s={settings} errors={errors} />}
      {group === "brand" && <BrandFields s={settings} errors={errors} />}
      {group === "typography" && (
        <TypographyFields
          headingFont={settings.headingFont}
          bodyFont={settings.bodyFont}
          siteTypography={settings.siteTypography}
          installed={fonts}
          errors={errors}
        />
      )}
      {group === "commerce" && <CommerceFields s={settings} errors={errors} />}
      {group === "seo" && <SeoFields s={settings} errors={errors} />}
      {group === "advanced" && <AdvancedFields s={settings} errors={errors} />}

      <SaveRow justSaved={justSaved} problem={summarise(errors)} />
    </form>
  );
}

/** One line naming what is wrong, rather than counting it. */
function summarise(errors: Record<string, string>): string | null {
  const named = Object.entries(errors).filter(([k, m]) => m && !k.startsWith("_"));
  if (named.length === 0) return null;
  if (named.length === 1) return named[0][1];
  return `${named.length} fields need fixing`;
}

function SaveRow({ justSaved, problem }: { justSaved: boolean; problem: string | null }) {
  const { pending } = useFormStatus();
  const slow = useSlowSave(pending);
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {problem ? (
        <span role="alert" className="text-xs text-primary">
          {problem}
        </span>
      ) : slow ? (
        <span role="status" className="text-xs text-primary">
          Still saving. It may already have worked — reload to check.
        </span>
      ) : justSaved ? (
        <span role="status" className="text-xs text-navy">
          Saved
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

type FieldsProps = { s: Settings; errors: Record<string, string> };

const row = "grid grid-cols-1 gap-4 sm:grid-cols-2";

function LegalFields({ s, errors }: FieldsProps) {
  return (
    <>
      <Field
        label="Registered entity"
        hint="exactly as registered"
        error={errors.legalEntity}
      >
        <input name="legalEntity" defaultValue={s.legalEntity} className={input} />
      </Field>
      <Field
        label="Registered address"
        hint="required in EU/UK consumer terms"
        error={errors.address}
      >
        <textarea name="address" defaultValue={s.address} rows={3} className={input} />
      </Field>
      <div className={row}>
        <Field label="Governing law" hint="e.g. England and Wales" error={errors.governingLaw}>
          <input name="governingLaw" defaultValue={s.governingLaw} className={input} />
        </Field>
        <Field
          label="Refund window"
          hint="days — stated on the checkout too"
          error={errors.refundWindowDays}
        >
          <input
            name="refundWindowDays"
            type="number"
            min={14}
            max={365}
            defaultValue={s.refundWindowDays}
            className={input}
          />
        </Field>
      </div>
      <div className={row}>
        <Field label="Company number" error={errors.companyNumber}>
          <input name="companyNumber" defaultValue={s.companyNumber} className={input} />
        </Field>
        <Field label="VAT number" hint="shown on invoices" error={errors.vatNumber}>
          <input name="vatNumber" defaultValue={s.vatNumber} className={input} />
        </Field>
      </div>
      <Field
        label="Privacy email"
        hint="where data requests go — a separate inbox from support, on purpose"
        error={errors.privacyEmail}
      >
        <input name="privacyEmail" type="email" defaultValue={s.privacyEmail} className={input} />
      </Field>
      <Field
        label="Policies last updated"
        hint="shown at the top of every policy page"
        error={errors.policiesUpdated}
      >
        <input name="policiesUpdated" defaultValue={s.policiesUpdated} className={input} />
      </Field>
    </>
  );
}

function IdentityFields({ s, errors }: FieldsProps) {
  return (
    <>
      <Field label="Store name" required error={errors.name}>
        <input name="name" defaultValue={s.name} className={input} />
      </Field>
      <Field
        label="Tagline"
        hint="one line — also the fallback meta description"
        error={errors.tagline}
      >
        <input name="tagline" defaultValue={s.tagline} className={input} />
      </Field>
      <p className="text-xs text-muted">
        The site address lives in the server environment, because every email link and canonical
        URL is built from it before this page can be read.
      </p>
    </>
  );
}

function BrandFields({ s, errors }: FieldsProps) {
  return (
    <>
      <div className={row}>
        <ColorField
          name="primaryColor"
          label="Primary colour"
          hint="buttons, links, accents"
          value={s.primaryColor}
          error={errors.primaryColor}
        />
        <ColorField
          name="deepColor"
          label="Deep colour"
          hint="headings, the admin rail"
          value={s.deepColor}
          error={errors.deepColor}
        />
      </div>
      <ImageField
        name="logoPath"
        label="Logo"
        hint="SVG or PNG on a transparent ground"
        value={s.logoPath}
        error={errors.logoPath}
      />
      <ImageField
        name="faviconPath"
        label="Favicon"
        hint="the browser tab — falls back to the logo"
        value={s.faviconPath}
        error={errors.faviconPath}
      />
    </>
  );
}

function CommerceFields({ s, errors }: FieldsProps) {
  return (
    <>
      <div className={row}>
        <Field label="Currency" hint="three-letter ISO code" error={errors.currency}>
          <input name="currency" defaultValue={s.currency} className={input} />
        </Field>
        <Field
          label="Support email"
          hint="on the policy pages and every refund reply"
          error={errors.contactEmail}
        >
          <input name="contactEmail" type="email" defaultValue={s.contactEmail} className={input} />
        </Field>
      </div>
      <Field
        label="Reply-time promise"
        hint="only if you will keep it — leave blank to promise nothing"
        error={errors.replyTime}
      >
        <input
          name="replyTime"
          defaultValue={s.replyTime}
          placeholder="We answer within one working day"
          className={input}
        />
      </Field>
    </>
  );
}

function SeoFields({ s, errors }: FieldsProps) {
  return (
    <>
      <Field
        label="Default meta title"
        hint="what Google shows for the storefront"
        error={errors.metaTitle}
      >
        <input name="metaTitle" defaultValue={s.metaTitle} className={input} />
      </Field>
      <Field label="Default meta description" error={errors.metaDescription}>
        <textarea
          name="metaDescription"
          defaultValue={s.metaDescription}
          rows={2}
          className={input}
        />
      </Field>
      <ImageField
        name="shareImagePath"
        label="Share image"
        hint="1200 × 630 — the card behind every shared link"
        value={s.shareImagePath}
        error={errors.shareImagePath}
      />
      <div className={row}>
        <Field label="Instagram" error={errors.socialInstagram}>
          <input name="socialInstagram" defaultValue={s.socialInstagram} className={input} />
        </Field>
        <Field label="YouTube" error={errors.socialYoutube}>
          <input name="socialYoutube" defaultValue={s.socialYoutube} className={input} />
        </Field>
        <Field label="X" error={errors.socialX}>
          <input name="socialX" defaultValue={s.socialX} className={input} />
        </Field>
        <Field label="LinkedIn" error={errors.socialLinkedin}>
          <input name="socialLinkedin" defaultValue={s.socialLinkedin} className={input} />
        </Field>
      </div>
    </>
  );
}

function AdvancedFields({ s, errors }: FieldsProps) {
  return (
    <>
      <Field
        label="Site-wide CSS"
        hint="applied to every store page, after the theme"
        error={errors.customCss}
      >
        <textarea name="customCss" defaultValue={s.customCss} rows={6} className={`${input} font-mono text-xs`} />
      </Field>
      <Field
        label="Site-wide JavaScript"
        hint="runs on every store page — a mistake here breaks all of them"
        error={errors.customJs}
      >
        <textarea name="customJs" defaultValue={s.customJs} rows={6} className={`${input} font-mono text-xs`} />
      </Field>
      <p className="text-xs text-muted">
        Neither of these runs in the admin, so a broken snippet can always be removed from here.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Field kinds that need state
// ---------------------------------------------------------------------------

function ColorField({
  name,
  label,
  hint,
  value,
  error,
}: {
  name: string;
  label: string;
  hint: string;
  value: string;
  error?: string;
}) {
  const [colour, setColour] = useState(value);
  return (
    <Field label={label} hint={hint} error={error}>
      <span className="flex items-center gap-2">
        {/* The native picker and the text both write the same field, because a
            hex you can paste matters as much as one you can point at. */}
        <input
          type="color"
          aria-label={`${label} picker`}
          value={/^#[0-9a-fA-F]{6}$/.test(colour) ? colour : "#000000"}
          onChange={(e) => setColour(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
        />
        <input
          name={name}
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          className={input}
        />
      </span>
    </Field>
  );
}

function ImageField({
  name,
  label,
  hint,
  value,
  error,
}: {
  name: string;
  label: string;
  hint: string;
  value: string;
  error?: string;
}) {
  const [path, setPath] = useState(value);
  const url = publicCoverUrl(path || null);
  return (
    <Field label={label} hint={hint} error={error}>
      <span className="flex items-center gap-3">
        <input type="hidden" name={name} value={path} />
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2 text-[0.6rem] text-muted">
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt="" className="size-full object-contain" />
          ) : (
            "none"
          )}
        </span>
        <MediaButton
          kind="image"
          onPick={(item: PickedMedia) => setPath(item.path)}
          label={path ? "Replace" : "Choose"}
        />
        {path && (
          <button
            type="button"
            onClick={() => setPath("")}
            className="text-xs text-muted underline-offset-2 hover:text-primary hover:underline"
          >
            Remove
          </button>
        )}
      </span>
    </Field>
  );
}
