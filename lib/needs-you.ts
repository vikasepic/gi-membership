import "server-only";
import { LEGAL_PLACEHOLDERS } from "@/lib/legal";
import { trackingProblems } from "@/lib/tracking";
import type { NavCounts } from "@/lib/admin-nav";

/**
 * The things the admin already knows are wrong and currently says nowhere.
 *
 * Every one of these is a fact the code holds: a legal field is a placeholder,
 * a tracking id is the wrong shape, an app is registered but switched off, an
 * error is queued. They were each discoverable by visiting the right page and
 * looking — which is exactly the wrong way round, because you visit a page when
 * you already suspect something.
 *
 * Only genuinely actionable things belong here. A panel with something soft in
 * it becomes another badge to scroll past, and then the real one goes unread
 * with it.
 */

export type Nudge = { label: string; href: string };

export function needsYou(counts: NavCounts): Nudge[] {
  const out: Nudge[] = [];

  if (LEGAL_PLACEHOLDERS.length > 0) {
    out.push({
      // Named rather than counted: "2 legal fields" tells you there is work,
      // "registered address" tells you what the work is.
      label: `Legal details unset — ${LEGAL_PLACEHOLDERS.join(", ")}`,
      href: "/admin/settings",
    });
  }

  for (const problem of trackingProblems()) {
    out.push({
      // Trimmed to the first sentence: the full explanation belongs on the page
      // it links to, not in a rail.
      label: problem.split(",")[0].split(" — ")[0],
      href: "/admin/errors",
    });
  }

  if (counts.errors > 0) {
    out.push({
      label: `${counts.errors} unresolved error${counts.errors === 1 ? "" : "s"}`,
      href: "/admin/errors",
    });
  }

  if (counts.apps.total > counts.apps.active) {
    const off = counts.apps.total - counts.apps.active;
    out.push({
      // An app that is registered and switched off delivers nothing, and the
      // failure is silent: purchases succeed and access never arrives.
      label: `${off} app${off === 1 ? "" : "s"} registered but switched off`,
      href: "/admin/apps",
    });
  }

  return out;
}
