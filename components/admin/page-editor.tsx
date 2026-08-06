"use client";

import { useMemo, useState } from "react";
import { saveSectionAction } from "@/app/admin/pages/actions";
import { SectionBand, type PageMoney } from "@/components/page/sales-page";
import {
  BAND_STYLES,
  sectionDef,
  type SectionRow,
  buildSectionView,
  type BandStyleKey,
} from "@/lib/page-sections";
import { BlockEditor } from "@/components/admin/block-editor";
import type { SectionEdit } from "@/components/admin/section-settings";
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

  // The scroll-into-view that used to run here is gone with the accordion:
  // opening a section no longer collapses another, so nothing jumps and there
  // is nothing to scroll back to.

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
  const openRow = rows.find((r) => r.sectionKey === openKey) ?? null;
  const openDef = openRow ? sectionDef(openRow.sectionKey) : null;

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
      <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/95 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={saveAll}
          disabled={saving || dirtyKeys.length === 0}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : dirtyKeys.length ? `Save ${dirtyKeys.length} change${dirtyKeys.length > 1 ? "s" : ""}` : "Saved"}
        </button>
        <span className="text-xs text-muted" aria-live="polite">
          {saveError
            ? saveError
            : dirtyKeys.length
              ? "Unsaved changes — kept as you type"
              : savedAt
                ? "All changes saved."
                : `${rows.length} sections`}
        </span>
        {pageIsBlank && (
          <button
            type="button"
            onClick={fillFromStarter}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-fg"
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
          className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:border-fg"
        >
          Preview whole page ↗
        </a>
      </div>

      {/* The spine: every section at once on the left, the selected one filling
          the rest. The accordion showed one band and hid eleven, so where you
          were in the page was something you had to remember. */}
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <SectionRail
          rows={rows}
          openKey={openKey}
          dirty={dirty}
          savedAt={savedAt}
          onSelect={setOpenKey}
          onToggle={(key, enabled) => patch(key, { enabled })}
        />

        {openRow && openDef ? (
          <SectionPanel
            row={openRow}
            money={money}
            onChange={(next) => patch(openRow.sectionKey, next)}
            device={device}
          />
        ) : (
          <p className="p-6 text-sm text-muted">Pick a section on the left.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Every section, always on screen.
 *
 * Twelve rows of name, band colour, state and a switch — in the height the
 * accordion spent on two. The number counts from one in the order they appear:
 * the stored numbering describes the framework these sections came from, and
 * on screen "1 + 2, 3 … 9, 9, +, 10, +" reads as a bug.
 */
function SectionRail({
  rows,
  openKey,
  dirty,
  savedAt,
  onSelect,
  onToggle,
}: {
  rows: SectionRow[];
  openKey: string | null;
  dirty: Record<string, boolean>;
  savedAt: number | null;
  onSelect: (key: string) => void;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  return (
    <nav className="flex flex-col border-b border-border lg:border-b-0 lg:border-r" aria-label="Sections">
      {rows.map((row, i) => {
        const def = sectionDef(row.sectionKey);
        if (!def) return null;
        const on = openKey === row.sectionKey;
        const isDirty = dirty[row.sectionKey];
        const view = buildSectionView(row);
        const empty = !view || blocksForSection(view).length === 0;

        return (
          <div
            key={row.sectionKey}
            className={`flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-sm last:border-b-0 ${
              on ? "bg-surface-2 shadow-[inset_2px_0_0_var(--primary)]" : "hover:bg-surface-2"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(row.sectionKey)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className="w-4 shrink-0 font-mono text-[0.62rem] text-muted">{i + 1}</span>
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-sm"
                style={{
                  background: BAND_STYLES[(row.style as BandStyleKey) ?? "paper"]?.bg,
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,.16)",
                }}
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  on ? "font-medium text-primary" : row.enabled ? "" : "text-muted line-through"
                }`}
              >
                {def.title}
              </span>
              {isDirty ? (
                <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Unsaved" />
              ) : savedAt !== null ? (
                <span className="size-1.5 shrink-0 rounded-full bg-navy/40" title="Saved" />
              ) : empty ? (
                <span className="shrink-0 text-[0.6rem] text-muted" title="Empty — it will not render">
                  Empty
                </span>
              ) : null}
            </button>

            {/* A switch, not an unlabelled checkbox. It decides whether a whole
                band appears on the live page. */}
            <button
              type="button"
              role="switch"
              aria-checked={row.enabled}
              aria-label={`Show ${def.title}`}
              onClick={() => onToggle(row.sectionKey, !row.enabled)}
              className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                row.enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-transform ${
                  row.enabled ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function SectionPanel({
  row,
  money,
  onChange,
  device,
}: {
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
    <div className="flex min-w-0 flex-col">
      {/* One bar: what this section is for, and the way in. The old panel spent
          a 420px column on a purpose sentence, a block count, a hint about
          dragging, a note that changes are kept as you type, and one button. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2">
        <b className="text-sm">{def.title}</b>
        {/* Which step of the framework this band is. It is real information and
            it does not belong on twelve rows — "1 + 2, 3 … 9, 9, +, 10, +"
            reads as a bug in a numbered list. Here it is context. */}
        <span className="font-mono text-[0.6rem] text-muted" title="Step in the sales-page framework">
          step {def.n}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted" title={def.purpose}>
          {def.purpose}
        </span>

        {/* One editor. The typed fields were a form; this is the editor. A
            section that has never been opened here converts its stored fields
            into blocks on the way in, so nothing is retyped — see
            sectionToBlocks. Nothing is written until Save. */}
        <BlockCanvasField
          row={row}
          title={`${def.title}`}
          section={{
            style: row.style ?? null,
            accent: row.accent ?? null,
            variant: row.variant ?? null,
            enabled: row.enabled,
            variants: def.variants,
            onChange,
          }}
          onChange={(next) => setField("blocks", next)}
        />

      </div>

      {/* The whole width for the preview now that the fields column is a bar.
          The hero goes side-by-side at 768px, so anything narrower previewed
          every section as its phone layout. */}
      <div className="bg-bg p-4">
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
  section,
  onChange,
}: {
  row: SectionRow;
  title: string;
  section: SectionEdit;
  onChange: (next: Block[]) => void;
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
          section={section}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
