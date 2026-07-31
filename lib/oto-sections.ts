// Parsing sales-page sections from the admin form.
//
// The editor is a textarea per section, one item per line, fields separated by
// a pipe. Chosen over a JSON field or a block builder because it is the format
// someone can actually fill in at speed while writing a launch — and because a
// malformed line degrades to a skipped row rather than a broken page.

export type OtoStat = { value: string; label: string };
export type OtoBenefit = { title: string; body: string };
export type OtoTestimonial = { name: string; result: string; quote: string };
export type OtoComparisonRow = { option: string; cost: string; time: string };
export type OtoFaq = { q: string; a: string };

export type OtoSections = {
  problem?: string;
  stats?: OtoStat[];
  benefits?: OtoBenefit[];
  testimonials?: OtoTestimonial[];
  comparison?: OtoComparisonRow[];
  faq?: OtoFaq[];
};

/** Split "a | b | c" into trimmed parts, dropping a trailing empty column. */
function cells(line: string): string[] {
  return line.split("|").map((c) => c.trim());
}

function lines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Build the sections object from the raw textarea values.
 *
 * A line missing its later fields still produces a row with empty strings
 * rather than being dropped: a benefit with a title and no body is a
 * half-finished edit, and showing it is how the author notices.
 */
export function parseOtoSections(input: {
  problem?: string;
  stats?: string;
  benefits?: string;
  testimonials?: string;
  comparison?: string;
  faq?: string;
}): OtoSections {
  const sections: OtoSections = {};

  const problem = (input.problem ?? "").trim();
  if (problem) sections.problem = problem;

  const stats = lines(input.stats).map((l) => {
    const [value = "", label = ""] = cells(l);
    return { value, label };
  });
  if (stats.length) sections.stats = stats;

  const benefits = lines(input.benefits).map((l) => {
    const [title = "", body = ""] = cells(l);
    return { title, body };
  });
  if (benefits.length) sections.benefits = benefits;

  const testimonials = lines(input.testimonials).map((l) => {
    const [name = "", result = "", quote = ""] = cells(l);
    return { name, result, quote };
  });
  if (testimonials.length) sections.testimonials = testimonials;

  const comparison = lines(input.comparison).map((l) => {
    const [option = "", cost = "", time = ""] = cells(l);
    return { option, cost, time };
  });
  if (comparison.length) sections.comparison = comparison;

  const faq = lines(input.faq).map((l) => {
    const [q = "", a = ""] = cells(l);
    return { q, a };
  });
  if (faq.length) sections.faq = faq;

  return sections;
}

/** Turn stored sections back into the textarea values the form shows. */
export function sectionsToForm(sections: OtoSections | null | undefined): Record<string, string> {
  const s = sections ?? {};
  return {
    problem: s.problem ?? "",
    stats: (s.stats ?? []).map((x) => `${x.value} | ${x.label}`).join("\n"),
    benefits: (s.benefits ?? []).map((x) => `${x.title} | ${x.body}`).join("\n"),
    testimonials: (s.testimonials ?? []).map((x) => `${x.name} | ${x.result} | ${x.quote}`).join("\n"),
    comparison: (s.comparison ?? []).map((x) => `${x.option} | ${x.cost} | ${x.time}`).join("\n"),
    faq: (s.faq ?? []).map((x) => `${x.q} | ${x.a}`).join("\n"),
  };
}

/**
 * Read sections off a row, tolerating anything unexpected.
 *
 * The column is jsonb, so it can in principle hold whatever was written into
 * it. This page runs after a payment; a malformed value must render an upsell
 * without that section, not throw.
 */
export function readOtoSections(value: unknown): OtoSections {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  const out: OtoSections = {};
  if (typeof v.problem === "string" && v.problem.trim()) out.problem = v.problem;
  if (arr(v.stats).length) out.stats = arr<OtoStat>(v.stats);
  if (arr(v.benefits).length) out.benefits = arr<OtoBenefit>(v.benefits);
  if (arr(v.testimonials).length) out.testimonials = arr<OtoTestimonial>(v.testimonials);
  if (arr(v.comparison).length) out.comparison = arr<OtoComparisonRow>(v.comparison);
  if (arr(v.faq).length) out.faq = arr<OtoFaq>(v.faq);
  return out;
}
