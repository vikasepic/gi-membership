"use client";

import { useState } from "react";
import { BlockEditor } from "@/components/admin/block-editor";
import { TemplateCard } from "@/components/admin/template-card";
import { saveTemplateAction, deleteTemplateAction } from "@/app/admin/templates/actions";
import { bandTheme, normalizeSectionLayout, type BandStyleKey } from "@/lib/page-sections";
import { newBlock, type Block } from "@/lib/blocks";
import type { Template, TemplateBand } from "@/lib/templates/template";
import type { SitePreview } from "@/lib/site-typography";
import type { TemplateKind } from "@/lib/templates-store";

// The templates screen.
//
// Two shelves, and the difference between them matters: the built-ins ship in
// code — version controlled, the same in every install, and not editable from
// here — while saved designs live in this store's database and are yours.
// Editing a built-in makes a saved COPY rather than changing the file, because
// the file is the one thing a bad afternoon cannot destroy.
//
// Editing is the block editor. Not a second, lesser editor for templates: a
// template is page content, so the thing that edits page content edits it, and
// anything the builder learns tomorrow this screen gets for free.

type Draft = {
  /** The row being edited, or null for one that does not exist yet. */
  savedId: string | null;
  name: string;
  group: string;
  blocks: Block[];
  band: TemplateBand | null;
  /** Which shelf it belongs to. Decided when it is created, not later. */
  kind: TemplateKind;
};

type Saved = Template & { savedId: string; updatedAt: string };

export function TemplatesScreen({
  saved,
  globals = [],
  usage = {},
  builtIns,
  preview,
}: {
  saved: Saved[];
  /** The designs pages link to rather than copy. Their own shelf, deliberately. */
  globals?: Saved[];
  /** How many sections point at each global, by id. */
  usage?: Record<string, number>;
  builtIns: Template[];
  preview?: SitePreview;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startNew = (kind: TemplateKind = "template") =>
    setDraft({
      savedId: null,
      name: "",
      group: kind === "global" ? "Global" : "Saved",
      // One heading, so the canvas is not empty and the first thing you do is
      // type rather than decide which block to add.
      blocks: [newBlock("heading")],
      band: null,
      kind,
    });

  const edit = (t: Template, savedId: string | null, kind: TemplateKind = "template") =>
    setDraft({
      savedId,
      kind,
      // A built-in opens as "Centred hero copy", because saving it makes a new
      // row rather than editing the file — and two things called the same
      // thing on one shelf is a shelf you cannot use.
      name: savedId ? t.name : `${t.name} copy`,
      group: t.group,
      blocks: t.blocks,
      band: t.band ?? null,
    });

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    if (draft.savedId) fd.append("id", draft.savedId);
    fd.append("name", draft.name);
    fd.append("group", draft.group);
    fd.append("blocks", JSON.stringify(draft.blocks));
    fd.append("band", draft.band ? JSON.stringify(draft.band) : "");
    fd.append("kind", draft.kind);
    const res = await saveTemplateAction({}, fd);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDraft(null);
  }

  async function remove(savedId: string, name: string) {
    if (!window.confirm(`Delete “${name}”? Pages already using it keep what they have.`)) return;
    const fd = new FormData();
    fd.append("id", savedId);
    const res = await deleteTemplateAction({}, fd);
    if (res.error) setError(res.error);
  }

  // The band a design is drawn on, as the editor's section panel understands
  // it — so editing a template edits its ground too, with the same controls
  // the page editor uses.
  const band = draft?.band ?? null;
  const theme = bandTheme(band?.style ?? "paper");

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-lg bg-[#f0c98a]/20 px-3 py-2 text-sm text-[#7a4b08]">{error}</p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg">Your designs</h2>
          <span className="text-xs text-muted">
            {saved.length === 0 ? "None yet" : `${saved.length} saved`}
          </span>
          <button
            type="button"
            onClick={() => startNew()}
            className="ml-auto rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            New design
          </button>
        </div>
        {saved.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
            Nothing saved yet. Build one here, or press <strong>Save as template</strong> in the
            builder on any section you have already made.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((t) => (
              <TemplateCard
                key={t.savedId}
                template={t}
                subtitle={t.group}
                onEdit={() => edit(t, t.savedId)}
                onDelete={() => remove(t.savedId, t.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* The other shelf, and the difference is the whole point: inserting one
          of these drops a LINK. Editing it changes every page that has it. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg">Global blocks</h2>
          <span className="text-xs text-muted">
            Linked, not copied — editing one changes every page using it
          </span>
          <button
            type="button"
            onClick={() => startNew("global")}
            className="ml-auto rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            New global block
          </button>
        </div>
        {globals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
            None yet. A global block is for the thing that appears on many pages and should only
            ever be written once — a guarantee, a footer, the bio.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {globals.map((t) => {
              const used = usage[t.savedId] ?? 0;
              return (
                <TemplateCard
                  key={t.savedId}
                  template={t}
                  subtitle={
                    used === 0
                      ? "Not used yet"
                      : `On ${used} section${used === 1 ? "" : "s"} — editing changes them all`
                  }
                  onEdit={() => edit(t, t.savedId, "global")}
                  onDelete={() => remove(t.savedId, t.name)}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg">Built in</h2>
          <span className="text-xs text-muted">
            Ship with the app. Editing one saves a copy of your own.
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builtIns.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              subtitle={t.group}
              onEdit={() => edit(t, null)}
            />
          ))}
        </div>
      </section>

      {draft && (
        <>
          {/* The name and its group sit above the editor rather than inside it:
              the editor is the design, and what the design is CALLED is not
              part of the design. */}
          <div className="fixed inset-x-0 top-0 z-[120] flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name this design"
              aria-label="Template name"
              className="w-64 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-fg"
            />
            <input
              value={draft.group}
              onChange={(e) => setDraft({ ...draft, group: e.target.value })}
              placeholder="Group"
              aria-label="Template group"
              className="w-40 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-fg"
            />
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="ml-auto rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? "Saving…" : draft.savedId ? "Save" : "Save design"}
            </button>
          </div>
          <div className="pt-11">
            <BlockEditor
              blocks={draft.blocks}
              theme={theme}
              title={draft.name || "New design"}
              section={{
                style: band?.style ?? "paper",
                accent: null,
                variant: null,
                enabled: true,
                background:
                  band?.color != null
                    ? ({ type: "classic", color: band.color } as never)
                    : null,
                layout: band?.layout ?? null,
                onChange: (patch) => {
                  // The band panel writes the same shape the page editor's
                  // does; here it lands on the template rather than on a row.
                  const next: TemplateBand = { ...(draft.band ?? {}) };
                  if (typeof patch.style === "string") next.style = patch.style as BandStyleKey;
                  if ("background" in patch) {
                    const bg = patch.background as { color?: string | null } | null;
                    next.color = bg?.color ?? null;
                  }
                  if ("layout" in patch) next.layout = normalizeSectionLayout(patch.layout);
                  setDraft({ ...draft, band: next });
                },
              }}
              onChange={(blocks) => setDraft({ ...draft, blocks })}
              onClose={() => void save()}
              preview={preview}
            />
          </div>
        </>
      )}
    </div>
  );
}
