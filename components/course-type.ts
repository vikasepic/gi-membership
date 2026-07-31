// Shared visual language for a course's type — the badge label and the wash
// behind its cover. Lives here rather than in either card so the storefront and
// the library cannot drift into two different vocabularies for the same thing.
//
// Terracotta (--primary) stays reserved for the primary CTA elsewhere, which is
// why only video borrows it and the rest lean on navy and plum.
export type BadgeType = "video" | "audio" | "pdf" | "text";

export const TYPE_META: Record<BadgeType, { label: string; accent: string; wash: string }> = {
  video: { label: "Video",   accent: "var(--primary)", wash: "color-mix(in srgb, var(--primary) 14%, var(--surface))" },
  audio: { label: "Audio",   accent: "var(--plum)",    wash: "color-mix(in srgb, var(--plum) 14%, var(--surface))" },
  pdf:   { label: "Guide",   accent: "var(--navy)",    wash: "color-mix(in srgb, var(--navy) 14%, var(--surface))" },
  text:  { label: "Reading", accent: "var(--plum)",    wash: "color-mix(in srgb, var(--plum) 14%, var(--surface))" },
};

export const FALLBACK_META = { label: "Course", accent: "var(--navy)", wash: "var(--surface-2)" };

export const metaFor = (type: string | null | undefined) =>
  type && type in TYPE_META ? TYPE_META[type as BadgeType] : FALLBACK_META;
