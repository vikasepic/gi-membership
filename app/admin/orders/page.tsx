import { listOrders } from "@/lib/orders";
import { RefundButton } from "@/components/admin/refund-button";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );

const STATUS_STYLE: Record<string, string> = {
  paid: "text-navy",
  refunded: "text-primary",
  pending: "text-muted",
  failed: "text-primary",
};

export default async function AdminOrdersPage() {
  const orders = await listOrders();
  // Refunded orders shouldn't inflate the revenue figure.
  const paid = orders.filter((o) => o.status === "paid");
  const gross = paid.reduce((n, o) => n + o.totalCents, 0);
  const refunded = orders.filter((o) => o.status === "refunded").length;
  const currency = orders[0]?.currency ?? "usd";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">Orders</h1>
        <p className="max-w-2xl text-sm text-muted">
          Every transaction, newest first. Refunding here also removes the buyer&rsquo;s access and
          cancels any subscription the order started.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Orders" value={String(orders.length)} />
        <Kpi label="Paid" value={money(gross, currency)} hint={`${paid.length} orders`} />
        <Kpi label="Refunded" value={String(refunded)} />
      </div>

      {orders.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
          No orders yet. They appear here the moment someone buys.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <div
              key={o.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium">{o.email}</span>
                <span className="font-display text-lg">{money(o.totalCents, o.currency)}</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span>{when(o.createdAt)}</span>
                <span className={STATUS_STYLE[o.status] ?? "text-muted"}>{o.status}</span>
                {o.buyerCountry && <span>{o.buyerCountry}</span>}
                {o.taxCents ? <span>incl. {money(o.taxCents, o.currency)} tax</span> : null}
              </div>

              {/* What they actually got. A bump or upsell is a separate line,
                  because it was a separate charge — never merged into one. */}
              {o.items.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
                  {o.items.map((i, idx) => (
                    <li key={idx} className="flex justify-between gap-4">
                      <span className="text-muted">
                        {i.description}
                        {i.kind !== "product" && (
                          <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] uppercase">
                            {i.kind}
                          </span>
                        )}
                        {i.stripeSubscriptionId && (
                          <span className="ml-2 text-[11px] text-muted">subscription</span>
                        )}
                      </span>
                      <span>{money(i.amountCents, o.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-end border-t border-border pt-3">
                {o.status === "paid" ? (
                  <RefundButton
                    orderId={o.id}
                    email={o.email}
                    amount={money(o.totalCents, o.currency)}
                  />
                ) : (
                  <span className="text-sm text-muted">
                    {o.status === "refunded" ? "Refunded" : "Nothing to refund"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5">
      <span className="kicker text-muted">{label}</span>
      <span className="font-display text-3xl">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
