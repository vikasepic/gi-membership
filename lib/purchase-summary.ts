import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { publicCoverUrl } from "@/lib/media";

/**
 * What somebody just bought, for the page they land on after paying.
 *
 * Read back from the order, never from the URL. The thank-you page is reached
 * two ways — straight from checkout with a payment_intent, or from the upsell
 * with `?oto=…` and nothing else — so the order is found from the signed-in
 * session in the second case. A buyer is signed in automatically the moment
 * payment succeeds, and can only ever be shown their own order.
 *
 * Everything here comes from `order_items`, which all three purchase paths
 * write. So the page can only ever list what was actually bought: no invented
 * lines, and amounts that match the receipt to the cent.
 */

export type PurchaseLine = {
  kind: string;
  title: string;
  amountCents: number;
  imageUrl: string | null;
  /** A trial takes nothing today; the money starts later and is said out loud. */
  trialEndsOn: string | null;
  recurringNote: string | null;
  /** Straight into the thing they bought, where there is something to open. */
  href: string | null;
};

export type PurchaseSummary = {
  orderId: string;
  firstName: string | null;
  currency: string;
  /** What was actually charged. */
  paidCents: number;
  /** Before any discount — shown struck through only when it differs. */
  listCents: number;
  lines: PurchaseLine[];
  /** True when a connected app was granted, so the app step is worth showing. */
  hasApp: boolean;
};

const firstNameOf = (full: string | null | undefined): string | null => {
  const first = (full ?? "").trim().split(/\s+/)[0];
  return first || null;
};

export async function purchaseSummary(args: {
  userId?: string | null;
  paymentIntentId?: string | null;
}): Promise<PurchaseSummary | null> {
  try {
    const db = createServiceClient();

    // The specific order when we have one, otherwise this buyer's most recent
    // paid order — which is the one they have just finished paying for.
    let q = db
      .from("orders")
      .select("id, email, user_id, currency, subtotal_cents, total_cents, status, created_at")
      .eq("status", "paid");
    q = args.paymentIntentId
      ? q.eq("stripe_payment_intent_id", args.paymentIntentId)
      : q.eq("user_id", args.userId ?? "").order("created_at", { ascending: false }).limit(1);
    const { data: rows } = await q;
    const order = rows?.[0];
    if (!order) return null;

    const [{ data: items }, { data: profile }] = await Promise.all([
      db
        .from("order_items")
        .select("kind, description, amount_cents, product_id, offer_id")
        .eq("order_id", order.id as string)
        .order("created_at"),
      db.from("users").select("username").eq("email", order.email as string).maybeSingle(),
    ]);

    const productIds = (items ?? []).map((i) => i.product_id).filter(Boolean) as string[];
    const offerIds = (items ?? []).map((i) => i.offer_id).filter(Boolean) as string[];

    const [{ data: products }, { data: offers }, { data: courses }] = await Promise.all([
      productIds.length
        ? db.from("products").select("id, title, cover_path").in("id", productIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      offerIds.length
        ? db
            .from("offers")
            .select("id, name, image_url, trial_days, price_cents, interval, grant_app_id")
            .in("id", offerIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      productIds.length
        ? db
            .from("product_courses")
            .select("product_id, courses(slug, status)")
            .in("product_id", productIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const productById = new Map((products ?? []).map((p) => [p.id as string, p]));
    const offerById = new Map((offers ?? []).map((o) => [o.id as string, o]));
    // First published course per product, so "start it" opens the thing itself
    // rather than the library index.
    const courseFor = new Map<string, string>();
    for (const row of (courses ?? []) as { product_id: string; courses: { slug: string; status: string } | null }[]) {
      const c = row.courses;
      if (c?.status === "published" && !courseFor.has(row.product_id)) {
        courseFor.set(row.product_id, c.slug);
      }
    }

    const boughtAt = new Date(order.created_at as string);
    const lines: PurchaseLine[] = (items ?? []).map((i) => {
      const product = i.product_id ? productById.get(i.product_id as string) : null;
      const offer = i.offer_id ? offerById.get(i.offer_id as string) : null;
      const trialDays = Number(offer?.trial_days ?? 0);
      const slug = i.product_id ? courseFor.get(i.product_id as string) : undefined;

      return {
        kind: String(i.kind ?? ""),
        title: String(product?.title ?? offer?.name ?? i.description ?? "Your purchase"),
        amountCents: Number(i.amount_cents ?? 0),
        imageUrl: product
          ? publicCoverUrl(product.cover_path as string | null)
          : ((offer?.image_url as string | null) ?? null),
        trialEndsOn:
          trialDays > 0
            ? new Date(boughtAt.getTime() + trialDays * 86_400_000).toISOString()
            : null,
        recurringNote:
          offer && Number(offer.price_cents ?? 0) > 0 && offer.interval
            ? `${(Number(offer.price_cents) / 100).toFixed(2)} / ${offer.interval}`
            : null,
        href: slug ? `/library/${slug}` : null,
      };
    });

    return {
      orderId: order.id as string,
      firstName: firstNameOf(profile?.username as string | null),
      currency: (order.currency as string) ?? "usd",
      paidCents: Number(order.total_cents ?? 0),
      listCents: Number(order.subtotal_cents ?? order.total_cents ?? 0),
      lines,
      hasApp: (offers ?? []).some((o) => Boolean(o.grant_app_id)),
    };
  } catch {
    // The page a buyer lands on after paying must render whatever happens. A
    // summary that cannot be built falls back to the plain confirmation.
    return null;
  }
}
