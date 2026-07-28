import { listMembers } from "@/lib/members";
import { cancelSubscriptionAction } from "./actions";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const date = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminMembersPage() {
  const members = await listMembers();
  const paying = members.filter((m) => m.orders > 0).length;
  const subs = members.reduce((n, m) => n + m.subscriptions.filter((s) => s.status !== "canceled").length, 0);
  const revenue = members.reduce((n, m) => n + m.spentCents, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Members</h1>
        <p className="text-sm text-muted">Everyone with an account, what they bought, and their subscriptions.</p>
      </div>

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
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
