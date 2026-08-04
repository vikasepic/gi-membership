import { Blocks } from "@/components/page/blocks";
import { normalizeBlocks } from "@/lib/blocks";
import {
  buildSectionView,
  isSectionEmpty,
  type SectionRow,
  type SectionView,
} from "@/lib/page-sections";
import {
  HeroSection,
  HeroStats,
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  OfferSection,
  AuthoritySection,
  ProofSection,
  ValueSection,
  CtaSection,
  type CtaRender,
} from "@/components/page/sections";

// The ten-section page, assembled.
//
// One renderer for the store sales page and the upsell page. A change to the
// Problem section fixes it in both places, which is the whole reason Ajit's
// structure is worth having as a structure rather than as a document.

export type PageMoney = {
  /** The real charge, formatted. Never typed by an admin. */
  priceLabel: string | null;
  /** e.g. "/month". */
  termsLabel: string | null;
};

function Band({ view, children }: { view: SectionView; children: React.ReactNode }) {
  return (
    <section className="@container px-6 py-12 md:py-16" style={{ background: view.theme.bg, color: view.theme.fg }}>
      <div className="mx-auto w-full max-w-[980px]">
        {children}
        {/* The block canvas, under the section's typed fields. One place rather
            than nine, so a section cannot be given blocks and quietly not
            render them. A section with only blocks is one whose typed fields
            were left empty. */}
        <Blocks blocks={normalizeBlocks((view.c as Record<string, unknown>).blocks)} theme={view.theme} />
      </div>
    </section>
  );
}

function renderOne(view: SectionView, money: PageMoney, cta?: CtaRender, preview?: boolean) {
  switch (view.def.key) {
    case "hero":
      return <HeroSection view={view} cta={cta} />;
    case "problem":
      return <ProblemSection view={view} />;
    case "solution":
      return <SolutionSection view={view} />;
    case "benefits":
      return <BenefitsSection view={view} />;
    case "offer":
      return <OfferSection view={view} priceLabel={money.priceLabel} />;
    case "authority":
      return <AuthoritySection view={view} />;
    case "proof":
      return <ProofSection view={view} preview={preview} />;
    case "value":
      return <ValueSection view={view} priceLabel={money.priceLabel} termsLabel={money.termsLabel} />;
    case "cta":
      return <CtaSection view={view} cta={cta} />;
  }
}

/** One band, on its own. Used by the editor's per-section preview. */
export function SectionBand({
  row,
  money,
  cta,
  /** Editor only. Lets a section explain a state a buyer never sees. */
  preview,
}: {
  row: SectionRow;
  money: PageMoney;
  cta?: CtaRender;
  preview?: boolean;
}) {
  const view = buildSectionView(row);
  if (!view) return null;
  // The hero opens the page and the CTA closes it with the real buy button, so
  // both stand on their own. Everything between them has to have something to
  // say, or it is not shown — see isSectionEmpty.
  const structural = view.def.key === "hero" || view.def.key === "cta";
  const carriesPrice = view.def.key === "value" && Boolean(money.priceLabel);
  if (!structural && !carriesPrice && isSectionEmpty(view) && !preview) return null;
  return (
    <>
      <Band view={view}>{renderOne(view, money, cta, preview)}</Band>
      {view.def.key === "hero" && <HeroStats view={view} />}
    </>
  );
}

export function SalesPage({
  rows,
  money,
  cta,
}: {
  rows: SectionRow[];
  money: PageMoney;
  /** The real buy control. Layout is the section's; the money path is not. */
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
