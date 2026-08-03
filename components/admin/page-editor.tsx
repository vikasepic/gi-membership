"use client";

import { useActionState, useMemo, useState } from "react";
import { saveSectionAction, type SectionSaveState } from "@/app/admin/pages/actions";
import { SectionBand, type PageMoney } from "@/components/page/sales-page";
import {
  BAND_STYLES,
  BAND_STYLE_KEYS,
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
        <a
          href={liveHref}
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-fg"
        >
          Preview whole page ↗
        </a>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.map((row) => {
          const def = sectionDef(row.sectionKey);
          if (!def) return null;
          const open = openKey === row.sectionKey;
          const isDirty = dirty[row.sectionKey];
          const justSaved = state.savedKey === row.sectionKey && !isDirty;

          return (
            <div key={row.sectionKey} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : row.sectionKey)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
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
      className="grid grid-cols-1 gap-0 border-t border-border lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
    >
      <input type="hidden" name="ownerType" value={ownerType} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <input type="hidden" name="sectionKey" value={row.sectionKey} />
      <input type="hidden" name="enabled" value={String(row.enabled)} />
      <input type="hidden" name="style" value={row.style} />
      <input type="hidden" name="accent" value={row.accent ?? ""} />
      <input type="hidden" name="variant" value={row.variant ?? ""} />
      <input type="hidden" name="content" value={JSON.stringify(content)} />

      {/* ---- fields ---- */}
      <div className="flex flex-col gap-4 p-5">
        <p className="text-sm text-muted">{def.purpose}</p>

        {def.fields.map((f) => (
          <Field key={f.key} def={f} value={content[f.key]} onChange={(v) => setField(f.key, v)} />
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
      <div className="flex flex-col gap-2 border-t border-border bg-bg p-5 lg:border-l lg:border-t-0">
        <span className="kicker text-muted">Preview — this section only</span>
        <div className="overflow-hidden rounded-xl border border-border">
          <SectionBand row={{ ...row, content }} money={money} />
        </div>
        <p className="text-xs text-muted">
          The component the live page renders, not a mock-up — so it cannot drift from what buyers
          see.
        </p>
      </div>
    </form>
  );
}

function Field({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.kind === "list") {
    const rows = listRows(value);
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {def.label}
          {def.hint && <span className="ml-2 font-normal text-muted">{def.hint}</span>}
        </span>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2 rounded-xl border border-border p-2.5">
            <span className="pt-2 font-mono text-xs text-muted">{i + 1}</span>
            <div className="flex flex-1 flex-col gap-1.5">
              {def.item.map((sub) =>
                sub.kind === "textarea" ? (
                  <textarea
                    key={sub.key}
                    rows={2}
                    value={r[sub.key] ?? ""}
                    placeholder={sub.label}
                    aria-label={`${def.label} ${i + 1} — ${sub.label}`}
                    onChange={(e) => {
                      const next = rows.map((x, j) => (j === i ? { ...x, [sub.key]: e.target.value } : x));
                      onChange(next);
                    }}
                    className={inputClass}
                  />
                ) : (
                  <input
                    key={sub.key}
                    value={r[sub.key] ?? ""}
                    placeholder={sub.label}
                    aria-label={`${def.label} ${i + 1} — ${sub.label}`}
                    onChange={(e) => {
                      const next = rows.map((x, j) => (j === i ? { ...x, [sub.key]: e.target.value } : x));
                      onChange(next);
                    }}
                    className={inputClass}
                  />
                ),
              )}
            </div>
            <button
              type="button"
              aria-label={`Remove ${def.label} ${i + 1}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="h-fit rounded-lg px-2 py-1 text-sm text-muted hover:text-primary"
            >
              ✕
            </button>
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
      <span className="text-sm font-medium">
        {def.label}
        {def.hint && <span className="ml-2 font-normal text-muted">{def.hint}</span>}
      </span>
      {def.kind === "textarea" ? (
        <textarea
          rows={def.rows ?? 3}
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
