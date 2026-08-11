// SCRATCH — not for delivery. Renders ONE built-in template inside a real
// band so the design can be compared against the reference screenshot at real
// widths. One per page on purpose: with every template on one page, a single
// overflowing design widens the document and every other template appears to
// overflow with it. Delete before merging.

import { SectionBand } from "@/components/page/sales-page";
import { listTemplates } from "@/lib/templates";
import { TemplatesScreen } from "@/components/admin/templates-screen";
import type { SectionRow } from "@/lib/page-sections";

// The band now travels with the template, so this route reads it off the
// design instead of keeping a second copy that can disagree.

export default async function TemplatePreview({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; screen?: string }>;
}) {
  const { id, screen } = await searchParams;
  // The templates screen, unguarded, so it can be seen without a session while
  // it is being built. Scratch, like the rest of this route.
  if (screen) {
    return (
      <div className="p-6">
        <TemplatesScreen saved={[]} builtIns={listTemplates()} />
      </div>
    );
  }
  const all = listTemplates();
  const showing = id ? all.filter((t) => t.id === id) : all.slice(0, 1);

  return (
    <main>
      {showing.map((t) => {
        const band = t.band;
        const row: SectionRow = {
          sectionKey: "benefits",
          position: 0,
          enabled: true,
          style: band?.style ?? "paper",
          accent: null,
          variant: null,
          content: { blocks: t.blocks },
          background: band?.color ? { type: "classic", color: band.color } : null,
          layout: band?.layout ?? null,
        };
        return (
          <div key={t.id} id={t.id}>
            {/* A neighbour above and below. A design whose picture stands
                proud of its band cannot be judged against the top of the
                window — the overhang is simply clipped, and the band looks
                like it fits when it does not. */}
            <div style={{ height: 120, background: "#f7f7f7" }} />
            <SectionBand row={row} money={{ priceLabel: "$499", termsLabel: null }} preview />
            <div style={{ height: 120, background: "#f7f7f7" }} />
          </div>
        );
      })}
    </main>
  );
}
