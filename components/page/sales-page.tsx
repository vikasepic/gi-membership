import { Blocks, type CtaRender } from "@/components/page/blocks";
import { blocksForSection } from "@/lib/section-to-blocks";
import { buildSectionView, type SectionRow, type SectionView } from "@/lib/page-sections";

// The page, assembled from blocks.
//
// One renderer for the store sales page, the upsell page and the editor's
// preview — and now one SOURCE too. Until this file changed, a band rendered
// through typed components reading defaults-merged content while the builder
// read only what was stored, so an unwritten hero previewed as "The outcome
// they want, in one line." and opened in the builder as an empty canvas. Two
// truths about the same section is worse than either of them.
//
// A section that has never been saved from the builder is converted on read,
// so nothing needed migrating and nothing was lost.

export type PageMoney = {
  /** The real charge, formatted. Never typed by an admin. */
  priceLabel: string | null;
  /** e.g. "/month". */
  termsLabel: string | null;
};

export type { CtaRender } from "@/components/page/blocks";

function Band({ view, children }: { view: SectionView; children: React.ReactNode }) {
  return (
    <section
      className="@container px-6 py-12 md:py-16"
      style={{ background: view.theme.bg, color: view.theme.fg }}
    >
      <div className="mx-auto w-full max-w-[1040px]">{children}</div>
    </section>
  );
}

/** One band, on its own. Used by the editor's per-section preview. */
export function SectionBand({
  row,
  money,
  cta,
  /** Editor only: show the band even when it has nothing in it yet. */
  preview,
}: {
  row: SectionRow;
  money: PageMoney;
  /** The real buy control. Layout is the section's; the money path is not. */
  cta?: CtaRender;
  preview?: boolean;
}) {
  const view = buildSectionView(row);
  if (!view) return null;
  const blocks = blocksForSection(view);
  // An unwritten band is absent, not empty. The editor still shows it, because
  // that is where you go to fill it in.
  if (blocks.length === 0 && !preview) return null;
  return (
    <Band view={view}>
      <Blocks blocks={blocks} theme={view.theme} money={money} cta={cta} />
    </Band>
  );
}

export function SalesPage({
  rows,
  money,
  cta,
}: {
  rows: SectionRow[];
  money: PageMoney;
  cta?: CtaRender;
}) {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  return (
    <div>
      {ordered.map((row) => (
        <SectionBand key={row.sectionKey} row={row} money={money} cta={cta} />
      ))}
    </div>
  );
}
