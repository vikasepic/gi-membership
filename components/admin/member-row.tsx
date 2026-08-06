"use client";

import { useState } from "react";
import { DeleteMember } from "@/components/admin/delete-member";
import { cancelSubscriptionAction, revokeAccessAction, toggleAdminAction } from "@/app/admin/members/actions";
import { holdsLabel, standingOf, type Standing } from "@/lib/member-view";
import { money } from "@/lib/money";
import type { MemberRow as Member } from "@/lib/members";
import type { AccessRow } from "@/lib/members";

const PILL: Record<Standing, { label: string; className: string }> = {
  paying: { label: "paying", className: "bg-navy/10 text-navy" },
  trialing: { label: "on trial", className: "bg-primary/12 text-primary" },
  lapsed: { label: "lapsed", className: "bg-surface-2 text-muted" },
  none: { label: "no access", className: "bg-surface-2 text-muted" },
};

const date = (s: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(s),
  );

/**
 * One member, one row — with everything that can go wrong kept behind a click.
 *
 * Delete used to sit in every row at the same weight as everything else, seven
 * times over. Repeating a destructive control is how one gets pressed on a
 * tired afternoon; it lives inside the row you deliberately opened now, next to
 * the reason you opened it.
 */
export function MemberRowView({
  member,
  access,
  isOwner,
  isSelf,
}: {
  member: Member;
  access: AccessRow[];
  /** Admin through ADMIN_EMAILS, which this page cannot change. */
  isOwner: boolean;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const standing = standingOf(member);
  const pill = PILL[standing];
  const holds = holdsLabel(member);

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`cursor-pointer border-b border-border/60 transition-colors last:border-b-0 ${
          open ? "bg-surface-2" : "hover:bg-surface-2"
        }`}
      >
        <td className="px-3 py-2.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{member.username || member.email}</span>
            {(member.isAdmin || isOwner) && (
              <span className="rounded border border-navy/40 px-1.5 text-[10px] uppercase tracking-wide text-navy">
                {isOwner ? "owner" : "admin"}
              </span>
            )}
          </span>
          {member.username && <span className="block text-xs text-muted">{member.email}</span>}
        </td>
        <td className="px-3 py-2.5 text-sm text-muted">{date(member.createdAt)}</td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${pill.className}`}>
            {pill.label}
          </span>
          {holds && <span className="ml-2 text-xs text-muted">{holds}</span>}
        </td>
        <td className="px-3 py-2.5 text-sm">
          {member.orders > 0 ? member.orders : <span className="text-muted">—</span>}
          {/* Someone with three refunded orders reading "0" is a column saying
              something untrue about them. */}
          {member.refundedOrders > 0 && (
            <span className="ml-1.5 text-[11px] text-muted">
              {member.refundedOrders} refunded
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right text-sm tabular-nums">
          {member.spentCents > 0 ? money(member.spentCents) : <span className="text-muted">$0</span>}
        </td>
        <td className="pr-3 text-right text-xs text-muted">{open ? "⌄" : "›"}</td>
      </tr>

      {open && (
        <tr className="border-b border-border/60 bg-surface-2 last:border-b-0">
          <td colSpan={6} className="px-3 pb-3">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-xl border border-border bg-surface p-4">
              <div className="flex min-w-56 flex-1 flex-col gap-2">
                <span className="kicker text-muted">Holds</span>
                {access.length === 0 && member.subscriptions.length === 0 ? (
                  <span className="text-sm text-muted">Nothing yet.</span>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {access.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2">
                        <span className={a.status === "canceled" ? "text-muted line-through" : ""}>
                          {a.label}
                        </span>
                        {a.granted && (
                          <span className="rounded-full border border-border px-1.5 text-[10px] text-muted">
                            granted by hand
                          </span>
                        )}
                        {a.status !== "canceled" && (
                          <form action={revokeAccessAction}>
                            <input type="hidden" name="ownershipId" value={a.id} />
                            <button className="text-xs text-muted hover:text-primary">Revoke</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex min-w-52 flex-col gap-2">
                <span className="kicker text-muted">Subscriptions</span>
                {member.subscriptions.length === 0 ? (
                  <span className="text-sm text-muted">None.</span>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {member.subscriptions.map((s, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <span>{s.appName}</span>
                        <span
                          className={
                            s.status === "canceled" ? "text-xs text-muted" : "text-xs text-navy"
                          }
                        >
                          {s.status}
                        </span>
                        {s.subscriptionId && s.status !== "canceled" && (
                          <form action={cancelSubscriptionAction}>
                            <input type="hidden" name="subscriptionId" value={s.subscriptionId} />
                            <button className="text-xs text-muted hover:text-primary">
                              Cancel at period end
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="ml-auto flex flex-col items-end gap-2">
                {/* An ADMIN_EMAILS account shows as permanent rather than
                    toggleable: the guard reads the env list first, so a toggle
                    here would claim to remove access it cannot remove. */}
                {isOwner ? (
                  <span
                    className="text-xs text-navy"
                    title="Set in ADMIN_EMAILS — change it in the environment"
                  >
                    Admin through the environment
                  </span>
                ) : (
                  <form action={toggleAdminAction}>
                    <input type="hidden" name="userId" value={member.id} />
                    <input type="hidden" name="email" value={member.email} />
                    <input type="hidden" name="makeAdmin" value={member.isAdmin ? "false" : "true"} />
                    <button
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        member.isAdmin
                          ? "border-navy/40 bg-navy/5 text-navy hover:border-primary"
                          : "border-border text-muted hover:border-primary hover:text-fg"
                      }`}
                    >
                      {member.isAdmin ? "Remove admin" : "Make admin"}
                    </button>
                  </form>
                )}
                <DeleteMember
                  userId={member.id}
                  email={member.email}
                  orders={member.orders}
                  isOwner={isOwner}
                  isSelf={isSelf}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
