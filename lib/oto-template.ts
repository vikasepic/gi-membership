// Which layout an offer's upsell page should use.
//
// Kept separate from the component map so the decision is plain TypeScript and
// can be tested without a JSX transform. components/oto/registry.tsx turns the
// name this returns into a component and nothing else.

export const OTO_TEMPLATES = ["short", "visual", "long", "sales"] as const;
export type OtoTemplateName = (typeof OTO_TEMPLATES)[number];

/** What renders when a choice is missing, unknown, or not yet built. */
export const DEFAULT_OTO_TEMPLATE: OtoTemplateName = "visual";

/**
 * Resolve a stored template value to a layout, or to "custom" when a coded
 * page is registered for that offer.
 *
 * Falls back rather than failing anywhere it can. This page is reached only
 * after someone has paid: a wrong layout is a bad upsell, a blank page is a
 * support ticket about a payment that actually succeeded.
 */
export function resolveOtoTemplate(args: {
  template: string | null | undefined;
  offerKey: string;
  /** Offer keys that have a coded page registered. */
  customKeys: readonly string[];
}): OtoTemplateName | "custom" {
  if (args.template === "custom") {
    return args.customKeys.includes(args.offerKey) ? "custom" : DEFAULT_OTO_TEMPLATE;
  }
  return (OTO_TEMPLATES as readonly string[]).includes(args.template ?? "")
    ? (args.template as OtoTemplateName)
    : DEFAULT_OTO_TEMPLATE;
}
