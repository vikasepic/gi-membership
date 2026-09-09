import type { AppKind } from "@/lib/apps";

/**
 * Which apps the admin list is showing.
 *
 * A whitelist rather than a parse, for the reason every other admin filter
 * gives: the value comes off the URL, and anything unrecognised has to select
 * a view rather than render nothing.
 */
export type AppKindFilter = "all" | AppKind;

export function appKindFrom(params: Record<string, string | string[] | undefined>): AppKindFilter {
  const raw = params.kind;
  const one = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return one === "internal" || one === "external" ? one : "all";
}

/**
 * The tabs to draw, with their counts.
 *
 * Derived from what is actually registered: a store with no built-in apps does
 * not get a Built-in tab standing permanently empty, and one with only built-in
 * apps does not get a Connected one. "All" appears only when there is more than
 * one kind to be all of.
 *
 * "Connected" rather than "External" throughout — the page's own intro, the
 * per-app badge and the offer form's grant picker all already say it, and
 * renaming it in one place only would make three screens disagree.
 */
export function appKindTabs(
  apps: { kind: AppKind }[],
): { key: AppKindFilter; label: string; count: number }[] {
  const internal = apps.filter((a) => a.kind === "internal").length;
  const external = apps.length - internal;
  if (internal === 0 || external === 0) return [];
  return [
    { key: "all", label: "All", count: apps.length },
    { key: "internal", label: "Built-in", count: internal },
    { key: "external", label: "Connected", count: external },
  ];
}

/** The apps a filter shows. */
export function appsOfKind<T extends { kind: AppKind }>(apps: T[], filter: AppKindFilter): T[] {
  return filter === "all" ? apps : apps.filter((a) => a.kind === filter);
}
