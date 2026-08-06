import type { MemberRow } from "@/lib/members";

/**
 * Where a member currently stands, and which of them are on screen.
 *
 * Separated from the page for the same reason the order filters are: the
 * figures at the top have to be counted from the same list the table shows, or
 * they describe a set nobody is looking at.
 */

export type Standing = "paying" | "trialing" | "lapsed" | "none";

export type MemberFilter = {
  standing: "all" | Standing | "admins";
  q: string;
  sort: "newest" | "oldest" | "spent";
};

export const DEFAULT_MEMBER_FILTER: MemberFilter = { standing: "all", q: "", sort: "newest" };

const STANDINGS = ["all", "paying", "trialing", "lapsed", "none", "admins"] as const;
const SORTS = ["newest", "oldest", "spent"] as const;

/**
 * What someone is right now.
 *
 * Order matters. Trialing beats paying because a trial that has not converted
 * is the state worth acting on, and a member who paid last month and is now on
 * a trial of something else is, for the purpose of this page, on a trial.
 * Lapsed means they had something and it ended — distinct from never having
 * had anything, which is the difference between a win-back and a stranger.
 */
export function standingOf(m: MemberRow): Standing {
  if (m.subscriptions.some((s) => s.status === "trialing")) return "trialing";
  if (m.subscriptions.some((s) => s.status === "active" || s.status === "past_due")) return "paying";
  if (m.orders > 0) return "paying";
  const hadSomething = m.subscriptions.length > 0 || m.courses > 0 || m.refundedOrders > 0;
  return hadSomething ? "lapsed" : "none";
}

export function memberFilterFrom(
  params: Record<string, string | string[] | undefined>,
): MemberFilter {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const pick = <T extends readonly string[]>(k: string, allowed: T, fallback: T[number]) => {
    const v = one(k);
    return (allowed as readonly string[]).includes(v ?? "") ? (v as T[number]) : fallback;
  };
  return {
    standing: pick("standing", STANDINGS, "all"),
    q: (one("q") ?? "").trim().slice(0, 120),
    sort: pick("sort", SORTS, "newest"),
  };
}

export function memberHref(filter: MemberFilter, patch: Partial<MemberFilter>): string {
  const next = { ...filter, ...patch };
  const q = new URLSearchParams();
  if (next.standing !== "all") q.set("standing", next.standing);
  if (next.q) q.set("q", next.q);
  if (next.sort !== "newest") q.set("sort", next.sort);
  const s = q.toString();
  return s ? `/admin/members?${s}` : "/admin/members";
}

/** Whether the guard would let this person into the admin, by either route. */
export const isAdminMember = (m: MemberRow, envAdmins: string[]) =>
  m.isAdmin || envAdmins.includes(m.email.toLowerCase());

function haystack(m: MemberRow): string {
  return [m.email, m.username ?? "", ...m.subscriptions.map((s) => s.appName)]
    .join(" ")
    .toLowerCase();
}

export function applyMemberFilter(
  members: MemberRow[],
  filter: MemberFilter,
  envAdmins: string[] = [],
): MemberRow[] {
  const q = filter.q.trim().toLowerCase();
  const out = members.filter((m) => {
    if (filter.standing === "admins") {
      if (!isAdminMember(m, envAdmins)) return false;
    } else if (filter.standing !== "all" && standingOf(m) !== filter.standing) {
      return false;
    }
    if (q && !haystack(m).includes(q)) return false;
    return true;
  });

  return [...out].sort((a, b) => {
    if (filter.sort === "spent") return b.spentCents - a.spentCents;
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    return filter.sort === "oldest" ? at - bt : bt - at;
  });
}

export type MemberTotals = {
  shown: number;
  paying: number;
  trialing: number;
  lapsed: number;
  admins: number;
  spentCents: number;
};

export function memberTotals(members: MemberRow[], envAdmins: string[] = []): MemberTotals {
  const by = (s: Standing) => members.filter((m) => standingOf(m) === s).length;
  return {
    shown: members.length,
    paying: by("paying"),
    trialing: by("trialing"),
    lapsed: by("lapsed"),
    admins: members.filter((m) => isAdminMember(m, envAdmins)).length,
    spentCents: members.reduce((n, m) => n + m.spentCents, 0),
  };
}

/** How many each chip would show, counted against the other filters. */
export function memberChipCounts(
  members: MemberRow[],
  filter: MemberFilter,
  envAdmins: string[] = [],
): Record<MemberFilter["standing"], number> {
  const counts = {} as Record<MemberFilter["standing"], number>;
  for (const standing of STANDINGS) {
    counts[standing] = applyMemberFilter(members, { ...filter, standing }, envAdmins).length;
  }
  return counts;
}

/** What their subscriptions add up to, in words, for the row. */
export function holdsLabel(m: MemberRow): string {
  const live = m.subscriptions.filter((s) => s.status !== "canceled");
  if (live.length > 0) return live.map((s) => s.appName).join(", ");
  if (m.subscriptions.length > 0) return m.subscriptions.map((s) => s.appName).join(", ");
  if (m.courses > 0) return `${m.courses} course${m.courses === 1 ? "" : "s"}`;
  return "";
}
