import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

// Member (customer) views for admin, plus the Stripe Customer Portal that lets
// a customer manage their own card, plan and cancellation. The portal is hosted
// by Stripe on purpose: card details never touch this app.

export type MemberRow = {
  id: string;
  email: string;
  username: string | null;
  createdAt: string;
  orders: number;
  spentCents: number;
  courses: number;
  subscriptions: { appName: string; status: string; subscriptionId: string | null }[];
};

export async function listMembers(): Promise<MemberRow[]> {
  const db = createServiceClient();

  const { data: users, error } = await db
    .from("users")
    .select("id, email, username, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listMembers: ${error.message}`);
  const ids = (users ?? []).map((u) => u.id as string);
  if (ids.length === 0) return [];

  const [{ data: orders }, { data: owns }, { data: apps }] = await Promise.all([
    db.from("orders").select("user_id, total_cents, status").in("user_id", ids),
    db.from("ownership").select("user_id, product_id, app_id, status, stripe_subscription_id").in("user_id", ids),
    db.from("apps").select("id, name"),
  ]);

  const appName = new Map((apps ?? []).map((a) => [a.id as string, a.name as string]));

  return (users ?? []).map((u) => {
    const uid = u.id as string;
    const paid = (orders ?? []).filter((o) => o.user_id === uid && o.status === "paid");
    const mine = (owns ?? []).filter((o) => o.user_id === uid);
    return {
      id: uid,
      email: u.email as string,
      username: (u.username as string) ?? null,
      createdAt: u.created_at as string,
      orders: paid.length,
      spentCents: paid.reduce((n, o) => n + ((o.total_cents as number) ?? 0), 0),
      courses: mine.filter((o) => o.product_id).length,
      subscriptions: mine
        .filter((o) => o.app_id)
        .map((o) => ({
          appName: appName.get(o.app_id as string) ?? "App",
          status: o.status as string,
          subscriptionId: (o.stripe_subscription_id as string) ?? null,
        })),
    };
  });
}

// Cancel at period end rather than immediately: the customer keeps what they
// already paid for until the term runs out, which is what "cancel" means to them.
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

// Stripe-hosted portal: update card, change plan, cancel, download invoices.
// Building these screens ourselves would mean handling card data; this way the
// PCI surface stays with Stripe.
export async function billingPortalUrl(userId: string, returnUrl: string): Promise<string | null> {
  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order?.stripe_customer_id) return null;

  const session = await stripe().billingPortal.sessions.create({
    customer: order.stripe_customer_id as string,
    return_url: returnUrl,
  });
  return session.url;
}
