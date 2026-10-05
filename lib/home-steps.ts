import { money } from "@/lib/money";
import { offerBlurb, shortDescription } from "@/lib/library-apps";
import type { HomeStep } from "@/lib/home-steps-schema";

/**
 * The home page as steps: every offer on the storefront and every published
 * product, sorted under the step it names, with what names none (or names a
 * step since deleted) collected under "Everything else". Pure, so the live
 * page and the builder canvas draw from one implementation.
 *
 * A step with nothing in it is left out, and the steps are numbered after
 * that, so a page never says "Step 1, Step 3".
 */

type StepOffer = {
  id: string;
  name: string;
  headline: string | null;
  description: string | null;
  imageUrl: string | null;
  grantType: "product" | "subscription";
  grantProductId: string | null;
  billingType: "one_time" | "recurring";
  interval: string | null;
  intervalCount: number | null;
  trialDays: number | null;
  priceCents: number;
  currency: string;
  homeStep?: string | null;
};

type StepProduct = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
  homeStep?: string | null;
};

export type StepItem = {
  key: string;
  kind: "App" | "Guide" | "Course";
  name: string;
  line: string | null;
  imageUrl: string | null;
  /** "$29", "$29 a month", or "In your library" for something they own. */
  price: string;
  /** "Pay once", "7 days free", "Monthly", or "Yours". */
  bill: string;
  href: string;
  owned: boolean;
};

export type StepView = HomeStep & { number: number; anchor: string; items: StepItem[] };

export type HomeStepsView = { steps: StepView[]; other: StepItem[] };

const EVERY: Record<string, string> = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };

function priceOf(o: Pick<StepOffer, "billingType" | "interval" | "intervalCount" | "priceCents" | "currency">): string {
  const price = money(o.priceCents, o.currency);
  if (o.billingType === "one_time" || !o.interval) return price;
  const count = o.intervalCount ?? 1;
  return count > 1 ? `${price} every ${count} ${o.interval}s` : `${price} a ${o.interval}`;
}

function billOf(o: Pick<StepOffer, "billingType" | "interval" | "trialDays">): string {
  if (o.billingType === "one_time" || !o.interval) return "Pay once";
  if (o.trialDays && o.trialDays > 0) return `${o.trialDays} days free`;
  return EVERY[o.interval] ?? "Recurring";
}

/** A video or audio course reads as a course; a PDF or written one as a guide. */
const productKind = (type: string | null | undefined): StepItem["kind"] =>
  type === "video" || type === "audio" ? "Course" : "Guide";

export function buildHomeSteps(input: {
  steps: HomeStep[];
  /** The storefront's offers, in Home order, each with its sales-page link resolved. */
  offers: { offer: StepOffer; href: string; owned: boolean }[];
  /** The published products, in catalogue order. */
  products: { product: StepProduct; coverUrl: string | null; type?: string | null; owned: boolean; accessHref?: string }[];
}): HomeStepsView {
  const fromOffers: [string | null | undefined, StepItem][] = input.offers.map(({ offer: o, href, owned }) => [
    o.homeStep,
    {
      key: `offer:${o.id}`,
      kind: o.grantType === "product" ? "Guide" : "App",
      name: o.name,
      line: offerBlurb(o),
      imageUrl: o.imageUrl,
      price: owned ? "In your library" : priceOf(o),
      bill: owned ? "Yours" : billOf(o),
      href: owned ? "/library" : href,
      owned,
    },
  ]);
  // A product an offer on the page already sells would otherwise be listed
  // twice, once at each price.
  const sold = new Set(input.offers.map(({ offer }) => offer.grantProductId).filter(Boolean));
  const fromProducts: [string | null | undefined, StepItem][] = input.products
    .filter(({ product }) => !sold.has(product.id))
    .map(({ product: p, coverUrl, type, owned, accessHref }) => [
      p.homeStep,
      {
        key: `product:${p.id}`,
        kind: productKind(type),
        name: p.title,
        line: shortDescription(p.tagline),
        imageUrl: coverUrl,
        price: owned ? "In your library" : money(p.priceCents, p.currency),
        bill: owned ? "Yours" : "Pay once",
        href: owned ? (accessHref ?? "/library") : `/p/${p.slug}`,
        owned,
      },
    ]);

  const byStep = new Map(input.steps.map((s) => [s.id, [] as StepItem[]]));
  const other: StepItem[] = [];
  for (const [stepId, item] of [...fromOffers, ...fromProducts]) {
    const list = stepId ? byStep.get(stepId) : undefined;
    (list ?? other).push(item);
  }

  const steps = input.steps
    .filter((s) => (byStep.get(s.id) ?? []).length > 0)
    .map((s, i) => ({ ...s, number: i + 1, anchor: `step-${i + 1}`, items: byStep.get(s.id)! }));
  return { steps, other };
}
