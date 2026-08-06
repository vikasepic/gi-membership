"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveSectionAction } from "@/app/admin/pages/actions";
import { SectionBand, type PageMoney } from "@/components/page/sales-page";
import {
  BAND_STYLES,
  BAND_STYLE_KEYS,
  sectionDef,
  type SectionRow,
  buildSectionView,
  type BandStyleKey,
} from "@/lib/page-sections";
import { BlockEditor } from "@/components/admin/block-editor";
import { DeviceSwitch } from "@/components/admin/device-switch";
import { blocksForSection, isUnconverted } from "@/lib/section-to-blocks";
import { starterBlocks } from "@/lib/page-starter";
import { warnNotBuyable } from "@/lib/page-buyable";
import { DEVICE_CANVAS, type Block, type Device } from "@/lib/blocks";
import type { OwnerType } from "@/lib/pages";

// The page editor.
//
// Ten rows; open one to edit it and watch it beside the fields. One Save at the
// top writes every section that changed — still one row per section underneath,
// which is what stops saving one of them discarding another.
// The preview renders SectionBand — the same component the live page renders —
// so it cannot show something a buyer would not see. A preview built from a
// separate mock-up goes stale the first time one side changes, and nobody
// notices until it is already wrong in production.

type Draft = Record<string, unknown>;

// Preview widths come from lib/blocks: the same three the builder edits at and
// the same three the emitted CSS breaks at. A preview on its own list of widths
// is a preview that can disagree with the page.

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
  const [device, setDevice] = useState<Device>("desktop");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirtyKeys = Object.keys(dirty).filter((k) => dirty[k]);

  /**
   * One save for the whole page.
   *
   * Still one write per section underneath — that is what stops a save of one
   * section discarding another — but the writer should not have to think about
   * which rows are dirty. Only changed sections are sent.
   */
  async function saveAll() {
    if (dirtyKeys.length === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    for (const key of dirtyKeys) {
      const row = rows.find((r) => r.sectionKey === key);
      if (!row) continue;
      const def = sectionDef(row.sectionKey);
      const fd = new FormData();
      fd.append("ownerType", ownerType);
      fd.append("ownerId", ownerId);
      fd.append("sectionKey", row.sectionKey);
      fd.append("enabled", String(row.enabled));
      fd.append("style", row.style);
      fd.append("accent", row.accent ?? "");
      fd.append("variant", row.variant ?? "");
      fd.append("content", JSON.stringify({ ...def?.defaults, ...(row.content as Draft) }));
      const res = await saveSectionAction({}, fd);
      if (res.error) {
        setSaveError(`${def?.title ?? row.sectionKey}: ${res.error}`);
        setSaving(false);
        return;
      }
      setDirty((d) => ({ ...d, [key]: false }));
    }
    setSaving(false);
    setSavedAt(Date.now());
  }

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

  // True only while nothing has been written anywhere on this page — the
  // starter fills every band at once, and offering it over work someone has
  // already done would be a button that destroys a page.
  const pageIsBlank = rows.every((r) => {
    const v = buildSectionView(r);
    return !v || blocksForSection(v).length === 0;
  });

  function fillFromStarter() {
    const starter = starterBlocks();
    setRows((rs) =>
      rs.map((r) => {
        const blocks = starter[r.sectionKey] ?? [];
        if (blocks.length === 0) return r;
        return { ...r, content: { ...(r.content as Record<string, unknown>), blocks } };
      }),
    );
    setDirty(Object.fromEntries(rows.filter((r) => (starter[r.sectionKey] ?? []).length > 0).map((r) => [r.sectionKey, true])));
  }

  // A page whose every button goes to a link is a page nobody can buy from. It
  // renders perfectly and converts at zero, and nothing else in the system
  // notices — the blocks are valid and the page is valid; only the money is
  // missing. Computed from what is on screen, so it clears the moment you fix
  // it rather than after a save.
  const notBuyable = warnNotBuyable(rows);

  return (
    <div className="flex flex-col gap-4">
      {notBuyable && (
        <div className="flex flex-col gap-1 rounded-2xl border border-primary/45 bg-primary/5 px-5 py-4">
          <span className="font-medium text-fg">Nothing on this page can be bought</span>
          <p className="max-w-2xl text-sm text-muted">
            Every button here goes to a link. Open a section, select a button and set{" "}
            <b className="font-medium text-fg">What it does</b> to <b className="font-medium text-fg">Buy</b>{" "}
            — or drag in a <b className="font-medium text-fg">Buy button</b>, which starts that way. A price
            card with a button label counts too.
          </p>
        </div>
      )}
      <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={saveAll}
          disabled={saving || dirtyKeys.length === 0}
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : dirtyKeys.length ? `Save ${dirtyKeys.length} change${dirtyKeys.length > 1 ? "s" : ""}` : "Saved"}
        </button>
        <span className="text-sm text-muted" aria-live="polite">
          {saveError
            ? saveError
            : dirtyKeys.length
              ? "Unsaved changes"
              : savedAt
                ? "All changes saved."
                : `${rows.length} sections. Open one to edit it.`}
        </span>
        {pageIsBlank && (
          <button
            type="button"
            onClick={fillFromStarter}
            className="rounded-full border border-border px-4 py-2 text-sm hover:border-fg"
            title="Fills every band with the layout and copy we built against the reference page. Nothing is saved until you press Save."
          >
            Start from the template
          </button>
        )}
        <DeviceSwitch device={device} onChange={setDevice} className="ml-auto" />
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
          const justSaved = savedAt !== null && !isDirty;

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
                  onChange={(next) => patch(row.sectionKey, next)}
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
  onChange,
  device,
}: {
  ownerType: OwnerType;
  ownerId: string;
  row: SectionRow;
  money: PageMoney;
  onChange: (next: Partial<SectionRow>) => void;
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
    // Not a form any more: one save at the top collects every dirty section, so
    // there is nothing here to submit.
    <div className="grid grid-cols-1 gap-0 border-t border-border lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">

      {/* Each pane pins and scrolls independently at lg and up, so the short
          one stays in view while the long one moves — whichever way round they
          happen to be. Below lg they stack and the page scrolls normally. */}
      <div className="flex flex-col gap-4 p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto">
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
          {def.purpose}
        </p>

        {/* One editor. The typed fields were a form; this is the editor. A
            section that has never been opened here converts its stored fields
            into blocks on the way in, so nothing is retyped — see
            sectionToBlocks. Nothing is written until Save. */}
        <BlockCanvasField
          row={row}
          title={`${def.n} · ${def.title}`}
          onChange={(next) => setField("blocks", next)}
          ownerType={ownerType}
          ownerId={ownerId}
        />

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

        <p className="pt-1 text-xs text-muted">
          Changes are kept as you type — use <strong className="text-fg">Save</strong> at the top of
          the page.
        </p>
      </div>

      {/* ---- preview ---- */}
      {/* Sticky: the fields column is long, and a preview that scrolls away is
          a preview you stop looking at. */}
      <div className="border-t border-border bg-bg p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="flex flex-col gap-2">
          <span className="kicker text-muted">
            Preview — this section only
            {DEVICE_CANVAS[device] ? ` · ${DEVICE_CANVAS[device]}px` : ""}
          </span>
          <div className="overflow-hidden rounded-xl border border-border">
            <div
              className="mx-auto transition-[max-width] duration-200"
              style={{ maxWidth: DEVICE_CANVAS[device] ?? undefined }}
            >
              <SectionBand row={{ ...row, content }} money={money} preview at={device} />
            </div>
          </div>
          <p className="text-xs text-muted">
            The component the live page renders, not a mock-up — so it cannot drift from what buyers
            see.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The block canvas for one section.
 *
 * A launcher rather than an inline canvas: a palette, a canvas and an inspector
 * do not fit in a 420px column beside the section list, and the builder needs
 * the whole viewport to be a builder rather than another form.
 *
 * It edits in place and writes back through the same setField as every other
 * field, so the one Save at the top of the page still covers it.
 */
function BlockCanvasField({
  row,
  title,
  onChange,
  ownerType,
  ownerId,
}: {
  row: SectionRow;
  title: string;
  onChange: (next: Block[]) => void;
  ownerType: OwnerType;
  ownerId: string;
}) {
  const [open, setOpen] = useState(false);
  const view = useMemo(() => buildSectionView(row), [row]);
  // Stored blocks if there are any; otherwise the section's typed content,
  // converted. That conversion is what makes this one editor rather than two.
  const blocks = useMemo(() => (view ? blocksForSection(view) : []), [view]);
  const converted = view ? isUnconverted(view) : false;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
        Content
        <span className="text-xs font-normal text-muted">
          {blocks.length === 0 ? "Empty" : `${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
        </span>
      </span>
      <p className="text-xs leading-relaxed text-muted">
        {converted && blocks.length > 0
          ? "Built from what this section already had. Nothing is changed until you save."
          : "Everything in this band, as blocks — drag, duplicate and restyle any of it."}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
      >
        {blocks.length === 0 ? "Start building" : "Edit this section"}
      </button>
      {open && view && (
        <BlockEditor
          blocks={blocks}
          theme={view.theme}
          title={title}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
