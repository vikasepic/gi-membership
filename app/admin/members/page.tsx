import Link from "next/link";
import { listMembers, accessForMember } from "@/lib/members";
import { listProductOptions, listOfferOptions } from "@/lib/admin";
import { adminEmails, isAdminEmail, requireAdmin } from "@/lib/admin-guard";
import { AddMember } from "@/components/admin/add-member";
import { MemberRowView } from "@/components/admin/member-row";
import { money } from "@/lib/money";
import {
  applyMemberFilter,
  memberChipCounts,
  memberFilterFrom,
  memberHref,
  memberTotals,
  type MemberFilter,
} from "@/lib/member-view";

const CHIPS: { key: MemberFilter["standing"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paying", label: "Paying" },
  { key: "trialing", label: "On trial" },
  { key: "lapsed", label: "Lapsed" },
  { key: "none", label: "No access" },
  { key: "admins", label: "Admins" },
];

const SORTS: { key: MemberFilter["sort"]; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "spent", label: "Most spent" },
];

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = memberFilterFrom(await searchParams);
  const [me, members] = await Promise.all([requireAdmin(), listMembers()]);

  // Everything that can be granted by hand, in one list the form posts back as
  // "kind:id" — products are owned outright, offers can carry app access.
  const [products, offers] = await Promise.all([listProductOptions(), listOfferOptions()]);
  const grants = [
    ...products.map((p) => ({ value: `product:${p.id}`, label: `Product — ${p.title}` })),
    ...offers.map((o) => ({ value: `offer:${o.id}`, label: `Offer — ${o.name}` })),
  ];

  const envAdmins = adminEmails();
  const shown = applyMemberFilter(members, filter, envAdmins);
  const counts = memberChipCounts(members, filter, envAdmins);
  // Counted from what is on screen, so filtering to the trials tells you about
  // the trials rather than about everyone.
  const totals = memberTotals(shown, envAdmins);
  const narrowed = shown.length !== members.length;

  // Only the rows being shown need their access read.
  const access = new Map(
    await Promise.all(shown.map(async (m) => [m.id, await accessForMember(m.id)] as const)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl">Members</h1>
          <p className="text-sm text-muted">
            Everyone with an account, what they hold, and who can reach this admin.
          </p>
        </div>
        {/* Behind a summary rather than open: adding someone is occasional, and
            the form used to own the top third of the page permanently. */}
        <details className="w-full max-w-2xl">
          <summary className="w-fit cursor-pointer list-none rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover [&::-webkit-details-marker]:hidden">
            + Add a member
          </summary>
          <div className="mt-3">
            <AddMember grants={grants} />
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-border pb-4">
        <Figure
          label={narrowed ? "Showing" : "Members"}
          value={String(totals.shown)}
          hint={narrowed ? `of ${members.length}` : undefined}
        />
        <Figure
          label="Paying"
          value={String(totals.paying)}
          hint={totals.spentCents ? money(totals.spentCents) : undefined}
        />
        <Figure label="On trial" value={String(totals.trialing)} />
        <Figure label="Lapsed" value={String(totals.lapsed)} />
        <Figure label="Admins" value={String(totals.admins)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => (
          <Link
            key={c.key}
            href={memberHref(filter, { standing: c.key })}
            aria-current={filter.standing === c.key ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              filter.standing === c.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted hover:border-fg hover:text-fg"
            }`}
          >
            {c.label}
            <span className="tabular-nums opacity-70">{counts[c.key]}</span>
          </Link>
        ))}

        <form action="/admin/members" className="ml-auto flex flex-wrap items-center gap-2">
          {filter.standing !== "all" && (
            <input type="hidden" name="standing" value={filter.standing} />
          )}
          {filter.sort !== "newest" && <input type="hidden" name="sort" value={filter.sort} />}
          <input
            name="q"
            defaultValue={filter.q}
            placeholder="Search name or email"
            aria-label="Search members"
            className="w-52 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <select
            name="sort"
            defaultValue={filter.sort}
            aria-label="Sort"
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-primary hover:text-fg"
          >
            Apply
          </button>
          {(filter.q || filter.standing !== "all" || filter.sort !== "newest") && (
            <Link href="/admin/members" className="text-xs text-muted underline-offset-4 hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
          {members.length === 0
            ? "No members yet."
            : "Nobody matches that. Clear the filters to see everyone."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[44rem] border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <Th>Member</Th>
                <Th>Joined</Th>
                <Th>Holds</Th>
                <Th>Orders</Th>
                <Th right>Spent</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <MemberRowView
                  key={m.id}
                  member={m}
                  access={access.get(m.id) ?? []}
                  grants={grants}
                  isOwner={isAdminEmail(m.email)}
                  isSelf={(me.email ?? "").toLowerCase() === m.email.toLowerCase()}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        <strong className="text-fg">Owner</strong> accounts come from ADMIN_EMAILS
        {envAdmins.length > 0 && <> ({envAdmins.join(", ")})</>} and can only be changed in the
        environment. That list is deliberately outside this page, so nothing done here can lock
        everyone out of the admin. <strong className="text-fg">Deleting</strong> removes the account,
        its access and its progress for good, and is refused for anyone who has ordered — their
        payments would be left with no customer attached, and that link is what a refund or a
        chargeback needs. Revoke their access instead.
      </p>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="kicker text-muted">{label}</span>
      <span className="font-display text-xl tabular-nums">
        {value}
        {hint && <span className="ml-1.5 text-xs font-normal text-muted">{hint}</span>}
      </span>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
