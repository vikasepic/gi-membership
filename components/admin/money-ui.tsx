import Link from "next/link";
import type { Journey } from "@/lib/member-money";
import type { LedgerKind } from "@/lib/ledger";

/**
 * The small parts the money screens share: a tile that follows the filter, a
 * chip that is a link, a pill for a state, a date with its distance from now.
 * Server components; nothing here holds state.
 */

export function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: "warn" | "bad" }) {
  return (
    <div className="flex min-w-[9rem] flex-col rounded-xl border border-border bg-surface px-3.5 py-3">
      <span className="kicker text-muted">{label}</span>
      <span className="font-display text-2xl tabular-nums">{value}</span>
      {hint && <span className={`text-xs ${tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-primary" : "text-muted"}`}>{hint}</span>}
    </div>
  );
}

export function Chip({ href, active, children, count }: { href: string; active: boolean; children: React.ReactNode; count?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-fg hover:border-primary/50"
      }`}
    >
      {children}
      {count !== undefined && <span className="text-muted">{count}</span>}
    </Link>
  );
}

const TONE: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-primary/12 text-primary",
  quiet: "bg-surface-2 text-muted",
};

export function Pill({ tone, children, title }: { tone: keyof typeof TONE; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function journeyTone(j: Journey): keyof typeof TONE {
  return j === "paying" ? "good" : j === "on trial" ? "warn" : j === "trial cancelled" || j === "cancelling" || j === "lapsed" ? "bad" : "quiet";
}

export function kindTone(k: LedgerKind): keyof typeof TONE {
  return k === "purchase" || k === "renewal" ? "good" : k === "refund" || k === "cancellation" ? "bad" : "quiet";
}

export const KIND_LABEL: Record<LedgerKind, string> = {
  purchase: "Purchase",
  renewal: "Renewal",
  trial: "Trial started",
  upsell: "Upsell",
  "add-on": "Add-on",
  refund: "Refund",
  cancellation: "Cancelled",
};

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export const fmtDate = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : "");
export const fmtTime = (iso: string) => TIME.format(new Date(iso));

/** "in 3 days", "tomorrow", "today", "4 days ago". */
export function relative(iso: string, now: Date): string {
  const days = Math.round((new Date(iso).getTime() - now.getTime()) / 864e5);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** A coming date, coloured by how soon. */
export function Soon({ iso, now }: { iso: string; now: Date }) {
  const days = (new Date(iso).getTime() - now.getTime()) / 864e5;
  const cls = days <= 2 ? "text-primary font-medium" : days <= 7 ? "text-amber-700 font-medium" : "";
  return <span className={cls}>{relative(iso, now)}</span>;
}

export function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2.5 text-left kicker text-muted ${right ? "text-right" : ""}`}>{children}</th>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}
