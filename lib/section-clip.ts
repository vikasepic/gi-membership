import { buildSectionView, sectionDef, type SectionRow } from "@/lib/page-sections";
import { blocksForSection } from "@/lib/section-to-blocks";
import { normalizeBlocks, reid } from "@/lib/blocks";
import type { Clip } from "@/lib/clipboard";

/**
 * Copy this section, or paste one over it.
 *
 * The clipboard holds BLOCKS, not the typed fields a section used to store.
 * `blocksForSection` resolves either shape, so copying converts once and paste
 * can then land anywhere — a Problem into an Authority, a hero into a
 * guarantee. Every section renders blocks identically; what differs between
 * them is their name and their purpose, and those belong to the slot rather
 * than to what is standing in it.
 *
 * The band, accent and background travel too, or a section arrives looking
 * like a different one. The variant does not travel across kinds: it names a
 * layout defined by the section it came from, and the target may have no such
 * thing — saveSection would drop it anyway, and dropping it here means the
 * editor shows what will actually be saved.
 */
export function sectionClip(row: SectionRow): Omit<Clip, "copiedAt"> {
  const view = buildSectionView(row);
  return {
    kind: "section",
    label: sectionDef(row.sectionKey)?.title ?? row.sectionKey,
    sectionKey: row.sectionKey,
    data: {
      blocks: view ? blocksForSection(view) : [],
      style: row.style,
      accent: row.accent,
      variant: row.variant,
      background: row.background,
      cssId: row.cssId,
      cssClass: row.cssClass,
    },
  };
}

export function pastedSection(clip: Clip, into: SectionRow): Partial<SectionRow> {
  const d = clip.data as Record<string, unknown>;
  const sameKind = clip.sectionKey === into.sectionKey;
  const blocks = Array.isArray(d.blocks) ? normalizeBlocks(d.blocks).map(reid) : [];
  return {
    // Blocks only. A typed field carried into a section whose definition has
    // never heard of it is a value nothing reads and nothing can remove.
    content: { blocks },
    style: (d.style as string) ?? into.style,
    accent: (d.accent as string | null) ?? null,
    variant: sameKind ? ((d.variant as string | null) ?? null) : null,
    background: d.background,
    cssId: (d.cssId as string | null) ?? null,
    cssClass: (d.cssClass as string | null) ?? null,
  };
}

