"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  saveSectionAction,
  uploadSectionImageAction,
  type SectionSaveState,
} from "@/app/admin/pages/actions";
import { SectionBand, type PageMoney } from "@/components/page/sales-page";
import {
  BAND_STYLES,
  BAND_STYLE_KEYS,
  imageSrc,
  sectionDef,
  type FieldDef,
  type SectionRow,
  type BandStyleKey,
} from "@/lib/page-sections";
import { inputClass } from "@/components/admin/form-controls";
import type { OwnerType } from "@/lib/pages";

// The page editor.
//
// Ten rows; open one to edit it, watch it beside the fields, and save only it.
// The preview renders SectionBand — the same component the live page renders —
// so it cannot show something a buyer would not see. A preview built from a
// separate mock-up goes stale the first time one side changes, and nobody
// notices until it is already wrong in production.

type Draft = Record<string, unknown>;

function listRows(value: unknown): Record<string, string>[] {
  return Array.isArray(value) ? (value as Record<string, string>[]) : [];
}

/**
 * Preview widths.
 *
 * "Desktop" fills whatever the pane gives it rather than scaling a fixed
 * canvas down: the sections use container queries, so a real width renders the
 * real composition, while a scaled canvas would show desktop styling at a size
 * nobody views it at. Mobile is a true 390px for the same reason.
 */
const DEVICES = { desktop: null, mobile: 390 } as const;
type Device = keyof typeof DEVICES;

export function PageEditor({
  ownerType,
  ownerId,
  initial,
  money,
  liveHref,
}: {
  ownerType: OwnerType;
  ownerId: string;
  initial: SectionRow[];
  money: PageMoney;
  liveHref: string;
}) {
  const [rows, setRows] = useState<SectionRow[]>(initial);
  const [openKey, setOpenKey] = useState<string | null>(initial[0]?.sectionKey ?? null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [state, action, pending] = useActionState<SectionSaveState, FormData>(saveSectionAction, {});
  const [device, setDevice] = useState<Device>("desktop");

  // Bring an opened section's header to the top.
  //
  // Opening one closes another, so a section below the one that just collapsed
  // jumps upward and you land somewhere in the middle of it. The scroll runs in
  // an effect rather than in the click handler because the collapse has to be
  // laid out first, otherwise it scrolls to where the row used to be.
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mounted = useRef(false);
  useEffect(() => {
    // Skip the first pass: the hero opens by default, and scrolling to it on
    // arrival would move a page the reader has not asked to move.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!openKey) return;
    const el = rowRefs.current[openKey];
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  }, [openKey]);

  const patch = (key: string, next: Partial<SectionRow>) => {
    setRows((rs) => rs.map((r) => (r.sectionKey === key ? { ...r, ...next } : r)));
    setDirty((d) => ({ ...d, [key]: true }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <span className="text-sm text-muted">
          Ten sections. Open one to edit it — each saves on its own.
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-border p-1">
          {(Object.keys(DEVICES) as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
              className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
                device === d ? "bg-navy text-white" : "text-muted hover:text-fg"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <a
          href={liveHref}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-fg"
        >
          Preview whole page ↗
        </a>
      </div>

      {/* No overflow-hidden here: it disables position:sticky in every
          descendant, which is why the preview scrolled away. The corners are
          rounded on the first and last rows instead. */}
      <div className="rounded-2xl border border-border bg-surface">
        {rows.map((row) => {
          const def = sectionDef(row.sectionKey);
          if (!def) return null;
          const open = openKey === row.sectionKey;
          const isDirty = dirty[row.sectionKey];
          const justSaved = state.savedKey === row.sectionKey && !isDirty;

          return (
            <div
              key={row.sectionKey}
              ref={(el) => {
                rowRefs.current[row.sectionKey] = el;
              }}
              // Clears the admin's sticky top bar, which would otherwise sit
              // over the header we just scrolled to.
              className="scroll-mt-20 border-b border-border first:rounded-t-2xl last:border-b-0 last:rounded-b-2xl"
            >
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : row.sectionKey)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 group-first:rounded-t-2xl ${
                  open ? "bg-surface-2" : ""
                }`}
              >
                <span className="w-10 shrink-0 font-mono text-xs text-muted">{def.n}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{def.title}</span>
                  <span className="truncate text-xs text-muted">{def.shape}</span>
                </span>
                <span
                  className="size-4 shrink-0 rounded"
                  style={{
                    background: BAND_STYLES[(row.style as BandStyleKey) ?? "paper"]?.bg,
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.16)",
                  }}
                  aria-hidden
                />
                {!row.enabled ? (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.68rem] text-muted">Off</span>
                ) : isDirty ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] text-primary">Unsaved</span>
                ) : justSaved ? (
                  <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[0.68rem] text-navy">Saved</span>
                ) : null}
                <span className={`text-xs text-muted transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
              </button>

              {open && (
                <SectionPanel
                  ownerType={ownerType}
                  ownerId={ownerId}
                  row={row}
                  money={money}
                  pending={pending}
                  error={state.savedKey === row.sectionKey ? undefined : state.error}
                  action={action}
                  onChange={(next) => patch(row.sectionKey, next)}
                  onSaved={() => setDirty((d) => ({ ...d, [row.sectionKey]: false }))}
                  device={device}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionPanel({
  ownerType,
  ownerId,
  row,
  money,
  pending,
  error,
  action,
  onChange,
  onSaved,
  device,
}: {
  ownerType: OwnerType;
  ownerId: string;
  row: SectionRow;
  money: PageMoney;
  pending: boolean;
  error?: string;
  action: (fd: FormData) => void;
  onChange: (next: Partial<SectionRow>) => void;
  onSaved: () => void;
  device: Device;
}) {
  const def = sectionDef(row.sectionKey)!;
  const content = useMemo<Draft>(
    () => ({ ...def.defaults, ...(row.content as Draft) }),
    [def.defaults, row.content],
  );

  const setField = (key: string, value: unknown) =>
    onChange({ content: { ...(row.content as Draft), [key]: value } });

  return (
    <form
      action={(fd) => {
        onSaved();
        action(fd);
      }}
      className="grid grid-cols-1 gap-0 border-t border-border lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]"
    >
      <input type="hidden" name="ownerType" value={ownerType} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <input type="hidden" name="sectionKey" value={row.sectionKey} />
      <input type="hidden" name="enabled" value={String(row.enabled)} />
      <input type="hidden" name="style" value={row.style} />
      <input type="hidden" name="accent" value={row.accent ?? ""} />
      <input type="hidden" name="variant" value={row.variant ?? ""} />
      <input type="hidden" name="content" value={JSON.stringify(content)} />

      {/* Each pane pins and scrolls independently at lg and up, so the short
          one stays in view while the long one moves — whichever way round they
          happen to be. Below lg they stack and the page scrolls normally. */}
      <div className="flex flex-col gap-4 p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto">
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
          {def.purpose}
        </p>

        {def.fields.map((f) => (
          <Field
            key={f.key}
            def={f}
            value={content[f.key]}
            onChange={(v) => setField(f.key, v)}
            ownerType={ownerType}
            ownerId={ownerId}
          />
        ))}

        {def.variants && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Layout</span>
            <div className="flex flex-wrap gap-2">
              {def.variants.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => onChange({ variant: v.key })}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    row.variant === v.key
                      ? "border-navy bg-navy/10 text-navy"
                      : "border-border text-muted hover:border-fg"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Band colour</span>
          <div className="flex flex-wrap items-center gap-2">
            {BAND_STYLE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                title={BAND_STYLES[k].label}
                aria-label={BAND_STYLES[k].label}
                aria-pressed={row.style === k}
                onClick={() => onChange({ style: k })}
                className={`size-8 rounded-lg border-2 transition-colors ${
                  row.style === k ? "border-fg" : "border-transparent"
                }`}
                style={{ background: BAND_STYLES[k].bg, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.16)" }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Accent <span className="ml-1 font-normal text-muted">buttons, numbers, ticks</span>
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={row.accent ?? BAND_STYLES[(row.style as BandStyleKey) ?? "paper"].accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              aria-label="Accent colour"
              className="size-9 cursor-pointer rounded-lg border border-border bg-surface p-1"
            />
            {row.accent && (
              <button
                type="button"
                onClick={() => onChange({ accent: null })}
                className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                Use the band&rsquo;s own
              </button>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="size-4 accent-[var(--primary)]"
          />
          <span>Show this section</span>
          <span className="text-muted">— switching it off keeps the copy</span>
        </label>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save this section"}
          </button>
          <span className="text-xs text-muted">Writes {def.title} only</span>
          {error && <span className="text-sm text-primary">{error}</span>}
        </div>
      </div>

      {/* ---- preview ---- */}
      {/* Sticky: the fields column is long, and a preview that scrolls away is
          a preview you stop looking at. */}
      <div className="border-t border-border bg-bg p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="flex flex-col gap-2">
          <span className="kicker text-muted">
            Preview — this section only{device === "mobile" ? " · 390px" : ""}
          </span>
          <div className="overflow-hidden rounded-xl border border-border">
            <div
              className="mx-auto transition-[max-width] duration-200"
              style={{ maxWidth: DEVICES[device] ?? undefined }}
            >
              <SectionBand row={{ ...row, content }} money={money} />
            </div>
          </div>
          <p className="text-xs text-muted">
            The component the live page renders, not a mock-up — so it cannot drift from what buyers
            see.
          </p>
        </div>
      </div>
    </form>
  );
}

/**
 * Grow a textarea to fit what is in it.
 *
 * A fixed row count clipped the pre-head — three lines of copy in a two-row
 * box, with the first line scrolled out of sight behind the label. Copy fields
 * hold whatever the writer needs them to; the box should follow.
 */
function rowsFor(value: string, min: number) {
  const lines = value.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 46)), 0);
  return Math.min(Math.max(lines, min), 14);
}

/** Label above, hint beneath it — not run together in one wrapping sentence. */
function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium">{text}</span>
      {hint && <span className="text-xs leading-snug text-muted">{hint}</span>}
    </span>
  );
}

function ImageField({
  def,
  value,
  onChange,
  ownerType,
  ownerId,
}: {
  def: Extract<FieldDef, { kind: "image" }>;
  value: unknown;
  onChange: (v: unknown) => void;
  ownerType: OwnerType;
  ownerId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = typeof value === "string" ? value : "";
  const src = imageSrc(text);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("ownerType", ownerType);
    fd.append("ownerId", ownerId);
    fd.append("file", file);
    const res = await uploadSectionImageAction(fd);
    setBusy(false);
    if (res.error || !res.path) {
      setError(res.error ?? "Upload failed.");
      return;
    }
    // Into the draft, not straight to the row: the section's own Save owns
    // persistence, and an image that appeared before Save would be the one
    // thing on this screen that behaved differently from everything else.
    onChange(res.path);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label text={def.label} hint={def.hint} />
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="aspect-[4/3] w-full max-w-48 rounded-xl border border-border object-cover"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs transition-colors hover:border-fg">
          {busy ? "Uploading…" : src ? "Replace" : "Upload an image"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {src && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Remove
          </button>
        )}
        <span className="text-xs text-muted">PNG or JPG, up to 5MB</span>
      </div>
      <input
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste a URL"
        className={`${inputClass} font-mono text-xs`}
      />
      {error && <span className="text-xs text-primary">{error}</span>}
    </div>
  );
}

function Field({
  def,
  value,
  onChange,
  ownerType,
  ownerId,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ownerType: OwnerType;
  ownerId: string;
}) {
  if (def.kind === "image") {
    return (
      <ImageField def={def} value={value} onChange={onChange} ownerType={ownerType} ownerId={ownerId} />
    );
  }

  if (def.kind === "list") {
    const rows = listRows(value);
    return (
      <div className="flex flex-col gap-2">
        <Label text={def.label} hint={def.hint} />
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface-2/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[0.7rem] text-muted">
                {def.label} {i + 1}
              </span>
              <button
                type="button"
                aria-label={`Remove ${def.label} ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="rounded px-1.5 text-sm text-muted hover:text-primary"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {def.item.map((sub) => {
                const v = r[sub.key] ?? "";
                const set = (nv: string) =>
                  onChange(rows.map((x, j) => (j === i ? { ...x, [sub.key]: nv } : x)));
                return (
                  <label key={sub.key} className="flex flex-col gap-1">
                    {/* Named, not just placeheld: a placeholder disappears the
                        moment there is content, and then nothing says which of
                        three stacked boxes is which. */}
                    <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted">
                      {sub.label}
                    </span>
                    {sub.kind === "textarea" ? (
                      <textarea
                        rows={rowsFor(v, 2)}
                        value={v}
                        onChange={(e) => set(e.target.value)}
                        className={inputClass}
                      />
                    ) : (
                      <input value={v} onChange={(e) => set(e.target.value)} className={inputClass} />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...rows, Object.fromEntries(def.item.map((s) => [s.key, ""]))])}
          className="w-fit rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted transition-colors hover:border-fg hover:text-fg"
        >
          + {def.addLabel}
        </button>
      </div>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <label className="flex flex-col gap-1.5">
      <Label text={def.label} hint={def.hint} />
      {def.kind === "textarea" ? (
        <textarea
          rows={rowsFor(text, def.rows ?? 3)}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      ) : (
        <input value={text} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
    </label>
  );
}
