import { listMembers, accessForMember } from "@/lib/members";
import { listProductOptions, listOfferOptions } from "@/lib/admin";
import { adminEmails, isAdminEmail } from "@/lib/admin-guard";
import { AddMember } from "@/components/admin/add-member";
import { cancelSubscriptionAction, revokeAccessAction, toggleAdminAction } from "./actions";

import { money } from "@/lib/money";
const date = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminMembersPage() {
  const members = await listMembers();

  // Everything that can be granted by hand, in one list the form can post back
  // as "kind:id" — products are owned outright, offers can carry app access.
  const [products, offers] = await Promise.all([listProductOptions(), listOfferOptions()]);
  const grants = [
    ...products.map((p) => ({ value: `product:${p.id}`, label: `Product — ${p.title}` })),
    ...offers.map((o) => ({ value: `offer:${o.id}`, label: `Offer — ${o.name}` })),
  ];

  // What each member currently holds, so access can be revoked from the row.
  const access = new Map(
    await Promise.all(members.map(async (m) => [m.id, await accessForMember(m.id)] as const)),
  );
  const envAdmins = adminEmails();
  const paying = members.filter((m) => m.orders > 0).length;
  const subs = members.reduce((n, m) => n + m.subscriptions.filter((s) => s.status !== "canceled").length, 0);
  const revenue = members.reduce((n, m) => n + m.spentCents, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Members</h1>
        <p className="text-sm text-muted">
          Everyone with an account, what they hold, and who can reach this admin.
        </p>
      </div>

      <AddMember grants={grants} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Members" value={String(members.length)} />
        <Kpi label="Paying" value={String(paying)} />
        <Kpi label="Active subs" value={String(subs)} />
        <Kpi label="Revenue" value={money(revenue)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Spent</th>
              <th className="px-4 py-3 font-medium">Subscriptions</th>
              <th className="px-4 py-3 font-medium">Access</th>
              <th className="px-4 py-3 font-medium">Admin</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span>{m.email}</span>
                    {m.username && <span className="text-xs text-muted">{m.username}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{date(m.createdAt)}</td>
                <td className="px-4 py-3">{m.orders}</td>
                <td className="px-4 py-3">{money(m.spentCents)}</td>
                <td className="px-4 py-3">
                  {m.subscriptions.length === 0 ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {m.subscriptions.map((s, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <span>{s.appName}</span>
                          <span className={s.status === "canceled" ? "text-xs text-muted" : "text-xs text-navy"}>
                            {s.status}
                          </span>
                          {s.subscriptionId && s.status !== "canceled" && (
                            <form action={cancelSubscriptionAction}>
                              <input type="hidden" name="subscriptionId" value={s.subscriptionId} />
                              <button className="text-xs text-muted hover:text-fg">Cancel at period end</button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>

                {/* What they hold, each revocable. */}
                <td className="px-4 py-3">
                  {(access.get(m.id) ?? []).length === 0 ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {(access.get(m.id) ?? []).map((a) => (
                        <li key={a.id} className="flex items-center gap-2">
                          <span className={a.status === "canceled" ? "text-muted line-through" : ""}>
                            {a.label}
                          </span>
                          {a.granted && (
                            <span className="rounded-full border border-border px-1.5 text-[0.65rem] text-muted">
                              granted
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
                </td>

                {/* Admin. ADMIN_EMAILS accounts show as permanent rather than
                    toggleable: the guard reads the env list first, so a toggle
                    here would claim to remove access it cannot remove. */}
                <td className="px-4 py-3">
                  {isAdminEmail(m.email) ? (
                    <span className="text-xs text-navy" title="Set in ADMIN_EMAILS — change it in the environment">
                      Owner
                    </span>
                  ) : (
                    <form action={toggleAdminAction}>
                      <input type="hidden" name="userId" value={m.id} />
                      <input type="hidden" name="email" value={m.email} />
                      <input type="hidden" name="makeAdmin" value={m.isAdmin ? "false" : "true"} />
                      <button
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          m.isAdmin
                            ? "border-navy/40 bg-navy/5 text-navy hover:border-primary"
                            : "border-border text-muted hover:border-primary hover:text-fg"
                        }`}
                      >
                        {m.isAdmin ? "Admin" : "Make admin"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        <strong className="text-fg">Owner</strong> accounts come from ADMIN_EMAILS
        {envAdmins.length > 0 && <> ({envAdmins.join(", ")})</>} and can only be changed in the
        environment. That list is deliberately outside this page, so nothing done here can lock
        everyone out of the admin.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5">
      <span className="kicker text-muted">{label}</span>
      <span className="font-display text-2xl">{value}</span>
    </div>
  );
}
