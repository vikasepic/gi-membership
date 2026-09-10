import Link from "next/link";
import { listOrders } from "@/lib/orders";
import { money } from "@/lib/money";
import { OrderRowView } from "@/components/admin/order-row";
import {
  applyFilter,
  chipCounts,
  filterFrom,
  filterHref,
  sourcesIn,
  totalsFor,
  type OrderFilter,
} from "@/lib/order-view";

const CHIPS: { key: OrderFilter["status"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "refunded", label: "Refunded" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "subscriptions", label: "Subscriptions" },
];

const RANGES: { key: OrderFilter["range"]; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];

const SORTS: { key: OrderFilter["sort"]; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "largest", label: "Largest first" },
];

/**
 * Orders, as something you can work.
 *
 * The filter lives in the URL rather than in component state, so a view is a
 * link — "the refunds from last month" can be sent to someone or kept in a tab,
 * and the back button means what it looks like it means.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const all = await listOrders();
  const sources = sourcesIn(all);
  const filter = filterFrom(await searchParams, sources);
  const shown = applyFilter(all, filter);
  const totals = totalsFor(shown, all[0]?.currency ?? "usd");
  const counts = chipCounts(all, filter);
  const narrowed = shown.length !== all.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Orders</h1>
        <p className="max-w-2xl text-sm text-muted">
          Refunding here also removes the buyer&rsquo;s access and cancels any subscription the order
          started.
        </p>
      </div>

      {/* Computed from what is on screen, not from everything. Three numbers
          that do not move when you filter are decoration. */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-border pb-4">
        <Figure label={narrowed ? "Showing" : "Orders"} value={String(totals.shown)} hint={narrowed ? `of ${all.length}` : undefined} />
        <Figure
          label="Taken"
          value={money(totals.paidCents, totals.currency)}
          hint={`${totals.paidCount} paid`}
        />
        <Figure
          label="Refunded"
          value={String(totals.refundedCount)}
          hint={totals.refundedCents ? money(totals.refundedCents, totals.currency) : undefined}
        />
        <Figure label="Average" value={money(totals.averageCents, totals.currency)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => (
          <Link
            key={c.key}
            href={filterHref(filter, { status: c.key })}
            aria-current={filter.status === c.key ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              filter.status === c.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted hover:border-fg hover:text-fg"
            }`}
          >
            {c.label}
            <span className="tabular-nums opacity-70">{counts[c.key]}</span>
          </Link>
        ))}

        {/* A GET form: typing a search and pressing enter is a navigation, so
            the result is a link like every other view here. */}
        <form action="/admin/orders" className="ml-auto flex flex-wrap items-center gap-2">
          {filter.status !== "all" && <input type="hidden" name="status" value={filter.status} />}
          {filter.range !== "all" && <input type="hidden" name="range" value={filter.range} />}
          {filter.sort !== "newest" && <input type="hidden" name="sort" value={filter.sort} />}
          <input
            name="q"
            defaultValue={filter.q}
            placeholder="Email, product or payment id"
            aria-label="Search orders"
            className="w-56 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <Picker name="range" value={filter.range} options={RANGES} label="Date range" />
          <Picker name="sort" value={filter.sort} options={SORTS} label="Sort" />
          {sources.length > 0 && (
            <Picker
              name="source"
              value={filter.source}
              options={[{ key: "", label: "Any source" }, ...sources.map((s) => ({ key: s, label: s }))]}
              label="Source"
            />
          )}
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-primary hover:text-fg"
          >
            Apply
          </button>
          {(filter.q || filter.range !== "all" || filter.sort !== "newest" || filter.status !== "all" || filter.source) && (
            <Link href="/admin/orders" className="text-xs text-muted underline-offset-4 hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
          {all.length === 0
            ? "No orders yet. They appear here the moment someone buys."
            : "Nothing matches that. Widen the date range, or clear the filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[54rem] border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <Th>Date</Th>
                <Th>Buyer</Th>
                <Th>What they bought</Th>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th right>Total</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <OrderRowView key={o.id} order={o} />
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function Picker<T extends string>({
  name,
  value,
  options,
  label,
}: {
  name: string;
  value: T;
  options: { key: T; label: string }[];
  label: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      aria-label={label}
      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
