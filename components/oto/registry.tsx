import { ShortOto, VisualOto, LongOto } from "@/components/oto/templates";
import { SalesOto } from "@/components/oto/sales-template";
import { resolveOtoTemplate } from "@/lib/oto-template";
import type { OtoView } from "@/components/oto/shell";

// Names to components. The decision about WHICH name to use lives in
// lib/oto-template.ts, so the fallback rules are plain TypeScript and testable
// without a JSX transform; this file is only the wiring.
//
// Two layers, on purpose:
//
//   TEMPLATES  chosen from a dropdown in admin. A new launch needs no
//              developer and no deploy.
//   CUSTOM     a coded page for one specific offer, keyed on offers.key — the
//              escape hatch for a launch that must look like nothing else,
//              while ordinary offers still never require code.
//
// A custom page receives the same OtoView and still uses OtoActions from
// shell.tsx to accept. Layout is the only thing it may reinvent; the money path
// is not up for redesign per launch.

export type OtoComponent = (props: { view: OtoView }) => React.ReactNode;

const TEMPLATES: Record<string, OtoComponent> = {
  short: ShortOto,
  visual: VisualOto,
  long: LongOto,
  sales: SalesOto,
};

/**
 * Bespoke pages, keyed on `offers.key`.
 *
 * To add one:
 *   1. write components/oto/custom/<offer-key>.tsx, taking { view } and using
 *      OtoActions from shell.tsx for accept and decline
 *   2. register it below
 *   3. set that offer's layout to "Custom" in admin
 *
 * Empty until a launch actually needs one: an unused abstraction with no
 * implementations is easier to delete than to unpick later.
 */
const CUSTOM: Record<string, OtoComponent> = {
  // "content-engine-monthly": ContentEngineOto,
};

export function otoComponentFor(args: { template: string; offerKey: string }): OtoComponent {
  const name = resolveOtoTemplate({
    template: args.template,
    offerKey: args.offerKey,
    customKeys: Object.keys(CUSTOM),
  });
  if (name === "custom") return CUSTOM[args.offerKey];
  return TEMPLATES[name];
}
