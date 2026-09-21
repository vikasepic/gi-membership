import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, adminEmails } from "@/lib/admin-guard";
import { listProductOptions, listOfferOptions } from "@/lib/admin";
import { accessForMember } from "@/lib/members";
import { loadMoneyData } from "@/lib/money-data";
import { deriveMembers } from "@/lib/member-money";
import { deriveLedger } from "@/lib/ledger";
import { money } from "@/lib/money";
import { cancelSubscriptionAction, revokeAccessAction, toggleAdminAction } from "@/app/admin/members/actions";
import { DeleteMember } from "@/components/admin/delete-member";
import { GrantMore } from "@/components/admin/grant-more";
import { RefundButton } from "@/components/admin/refund-button";
import { Tile, Pill, journeyTone, kindTone, KIND_LABEL, fmtDate, relative, Soon } from "@/components/admin/money-ui";

/**
 * One person: what they have paid, what recurs, what happens next, every
 * money movement in order, each subscription with its dates, and the levers.
 */
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, data, access, products, offers] = await Promise.all([requireAdmin(), loadMoneyData(), accessForMember(id), listProductOptions(), listOfferOptions()]);
  const m = deriveMembers(data).find((x) => x.id === id);
  if (!m) notFound();
  const rows = deriveLedger(data).filter((r) => r.userId === id);
  const envAdmins = adminEmails();
  const isOwner = envAdmins.includes(m.email.toLowerCase());
  const customer = data.subscriptions.find((s) => s.userId === id && s.stripeCustomerId)?.stripeCustomerId ?? null;
  const grants = [
    ...products.map((p) => ({ value: `product:${p.id}`, label: `Product — ${p.title}` })),
    ...offers.map((o) => ({ value: `offer:${o.id}`, label: `Offer — ${o.name}` })),
  ];
  const held = access.filter((a) => a.status !== "canceled").map((a) => a.grantValue).filter((v): v is string => v !== null);
  const per = (s: (typeof m.subs)[number]) => `${money(s.amountCents, s.currency)} ${s.interval ? `every ${s.intervalCount && s.intervalCount > 1 ? `${s.intervalCount} ${s.interval}s` : s.interval}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/members" className="text-xs text-muted hover:text-fg">← Members</Link>
        <h1 className="text-2xl">{m.name || m.email}</h1>
        <p className="text-sm text-muted">
          {m.email} · joined {fmtDate(m.joinedAt)} · came from {m.source}
          {" · "}<Pill tone={journeyTone(m.journey)}>{m.journey}</Pill>
          {m.converted && <> <Pill tone="good">converted</Pill></>}
          {(m.isAdmin || isOwner) && <> <Pill tone="quiet">{isOwner ? "owner" : "admin"}</Pill></>}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2.5">
            <Tile label="Total paid" value={money(m.totalPaidCents - m.refundedCents, m.currency)} hint={`${m.payments} payment${m.payments === 1 ? "" : "s"}${m.refundedCents ? `, ${money(m.refundedCents, m.currency)} refunded` : ""}`} />
            <Tile label="A month" value={money(m.mrrCents, m.currency)} hint={m.mrrCents ? "recurring right now" : "nothing recurring"} />
            <Tile label="Next event" value={m.nextEvent ? `${m.nextEvent.what} ${relative(m.nextEvent.at, data.now)}` : "—"} hint={m.nextEvent ? `${fmtDate(m.nextEvent.at)} · ${m.nextEvent.name}` : "nothing scheduled"} />
          </div>

          <section className="rounded-2xl border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-sm font-medium">Money timeline</h2>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul>
                {rows.map((r) => (
                  <li key={r.id} className="grid grid-cols-[7rem_1fr_auto] items-baseline gap-3 border-t border-border px-4 py-3 text-sm first:border-t-0">
                    <span className="whitespace-nowrap text-muted">{fmtDate(r.at)}</span>
                    <span>
                      <Pill tone={kindTone(r.kind)}>{KIND_LABEL[r.kind]}</Pill> {r.what}
                      {r.trial && (
                        <span className="text-muted"> · {money(r.trial.thenCents, r.currency)} a {r.trial.interval ?? "month"} after · {r.trial.outcome === "on trial" && r.trial.endsAt ? <>ends <Soon iso={r.trial.endsAt} now={data.now} /></> : r.trial.outcome}{r.trial.outcome !== "on trial" && r.trial.outcomeAt ? ` ${fmtDate(r.trial.outcomeAt)}` : ""}</span>
                      )}
                      {!r.livemode && <> <Pill tone="quiet">test mode</Pill></>}
                      {r.kind === "purchase" && r.orderId && !r.refunded && r.amountCents > 0 && (
                        <span className="ml-2 inline-block"><RefundButton orderId={r.orderId} email={r.email} amount={money(r.amountCents, r.currency)} /></span>
                      )}
                    </span>
                    <span className={`whitespace-nowrap text-right font-display tabular-nums ${r.amountCents < 0 ? "text-primary" : r.amountCents === 0 ? "text-muted" : ""}`}>
                      {r.amountCents === 0 ? "$0" : money(r.amountCents, r.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-sm font-medium">Subscriptions</h2>
            {m.subs.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None.</p>
            ) : (
              m.subs.map((s) => (
                <div key={s.stripeSubscriptionId} className="mt-3 rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 font-medium">
                    <span>{s.name}</span>
                    <Pill tone={s.state === "paying" ? "good" : s.state === "on trial" ? "warn" : s.state === "past due" || s.state === "cancelling" || s.state === "cancelled" || s.state === "trial cancelled" ? "bad" : "quiet"}>{s.state}</Pill>
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted">Price</dt><dd>{per(s)}{s.installments ? ` × ${s.installments}` : ""}</dd>
                    <dt className="text-muted">Started</dt><dd>{fmtDate(s.startedAt)}</dd>
                    {s.trialEnd && <><dt className="text-muted">Trial {new Date(s.trialEnd) > data.now ? "ends" : "ended"}</dt><dd>{fmtDate(s.trialEnd)}</dd></>}
                    {s.nextChargeAt && s.state !== "on trial" && <><dt className="text-muted">Next charge</dt><dd>{fmtDate(s.nextChargeAt)}</dd></>}
                    {s.cancelsAt && <><dt className="text-muted">Cancels</dt><dd>{fmtDate(s.cancelsAt)}</dd></>}
                    {s.canceledAt && <><dt className="text-muted">Cancelled</dt><dd>{fmtDate(s.canceledAt)}</dd></>}
                    <dt className="text-muted">Paid so far</dt><dd>{s.paidInvoices} payment{s.paidInvoices === 1 ? "" : "s"}, {money(s.paidTotalCents, s.currency)}</dd>
                  </dl>
                  {(s.state === "paying" || s.state === "on trial" || s.state === "past due") && (
                    <form action={cancelSubscriptionAction} className="mt-2">
                      <input type="hidden" name="subscriptionId" value={s.stripeSubscriptionId} />
                      <button type="submit" className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary">Cancel at period end</button>
                    </form>
                  )}
                </div>
              ))
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-sm font-medium">Access</h2>
            {access.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Holds nothing.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {access.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span>{a.label} <span className="text-xs text-muted">{a.status}{a.granted ? " · granted" : ""}</span></span>
                    {a.status !== "canceled" && (
                      <form action={revokeAccessAction}>
                        <input type="hidden" name="ownershipId" value={a.id} />
                        <button type="submit" className="text-xs text-muted hover:text-primary">Revoke</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-primary hover:underline">Grant access</summary>
              <div className="mt-2"><GrantMore userId={m.id} held={held} grants={grants} /></div>
            </details>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <h2 className="text-sm font-medium">Account</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {customer && (
                <a href={`https://dashboard.stripe.com/customers/${customer}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open in Stripe ↗</a>
              )}
              {/* An environment admin cannot be toggled off: the guard reads the
                  environment first and would let them straight back in, so a
                  toggle here would claim to remove access it cannot remove. */}
              {isOwner ? (
                <span className="text-xs text-muted">Admin through the environment</span>
              ) : (
                <form action={toggleAdminAction}>
                  <input type="hidden" name="userId" value={m.id} />
                  <input type="hidden" name="email" value={m.email} />
                  <input type="hidden" name="makeAdmin" value={m.isAdmin ? "false" : "true"} />
                  <button type="submit" className="text-xs text-muted hover:text-fg">{m.isAdmin ? "Remove admin" : "Make admin"}</button>
                </form>
              )}
              <DeleteMember userId={m.id} email={m.email} orders={m.payments} isOwner={isOwner} isSelf={me.email?.toLowerCase() === m.email.toLowerCase()} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
