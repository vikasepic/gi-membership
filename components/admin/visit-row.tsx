"use client";

import { useState } from "react";
import { money } from "@/lib/money";
import { shortDateTime } from "@/lib/dates";
import { labelPairs, outcomeOf, type VisitRow } from "@/lib/visit-reports";

/**
 * One visit, and its detail only when asked for.
 *
 * The same shape as an order row, because it is the same job: scan a list,
 * find the one you are looking for, open it. The full landing link lives in
 * the detail rather than the row — it is the longest thing here and the
 * least often needed.
 */
export function VisitRowView({ visit }: { visit: VisitRow }) {
  const [open, setOpen] = useState(false);
  const last = labelPairs(visit.utmLast);
  const first = labelPairs(visit.utmFirst);
  const purchase = visit.steps.find((s) => s.step === "purchase");
  const outcome = outcomeOf(visit);
  const seeded = visit.userAgent === null;

  const cameFrom =
    visit.utmLast.utm_campaign || visit.utmLast.utm_source || visit.referrerHost || "direct";

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`cursor-pointer border-b border-border/60 transition-colors last:border-b-0 ${open ? "bg-surface-2" : "hover:bg-surface-2"}`}
      >
        <td className="px-3 py-2.5 text-sm text-muted">{shortDateTime(visit.startedAt)}</td>
        <td className="px-3 py-2.5 text-sm">
          <span className="line-clamp-1">{visit.landingPath}</span>
        </td>
        <td className="px-3 py-2.5 text-sm text-muted">
          <span className="line-clamp-1">{cameFrom}</span>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted">
          {seeded ? "before visit tracking" : `${visit.device} · ${visit.browser}`}
        </td>
        <td className="px-3 py-2.5 text-right text-sm">
          {purchase ? (
            <span className="font-medium tabular-nums">{money(purchase.valueCents ?? 0, "usd")}</span>
          ) : outcome === "browsed" ? (
            <span className="text-muted">—</span>
          ) : (
            <span className="text-muted">{outcome}</span>
          )}
        </td>
        <td className="pr-3 text-right text-xs text-muted">{open ? "⌄" : "›"}</td>
      </tr>

      {open && (
        <tr className="border-b border-border/60 bg-surface-2 last:border-b-0">
          <td colSpan={6} className="px-3 pb-3">
            <div className="flex flex-wrap items-start gap-x-10 gap-y-4 rounded-xl border border-border bg-surface p-4 text-xs">
              <div className="flex min-w-64 flex-1 flex-col gap-1">
                <span className="kicker text-muted">Landed on</span>
                <span className="break-all">
                  {visit.landingPath}
                  {visit.landingQuery ? `?${visit.landingQuery}` : ""}
                </span>
                {visit.referrer && (
                  <>
                    <span className="kicker mt-2 text-muted">Referrer</span>
                    <span className="break-all">{visit.referrer}</span>
                  </>
                )}
                {visit.userAgent && (
                  <>
                    <span className="kicker mt-2 text-muted">Browser</span>
                    <span className="break-all text-muted">{visit.userAgent}</span>
                  </>
                )}
              </div>

              <div className="flex min-w-48 flex-col gap-1">
                <span className="kicker text-muted">Last touch</span>
                {last.length === 0 ? <span className="text-muted">no campaign</span> : last.map((p) => (
                  <span key={p.label}>
                    <span className="text-muted">{p.label} </span>
                    {p.value}
                  </span>
                ))}
                {first.length > 0 && (
                  <>
                    <span className="kicker mt-2 text-muted">First touch</span>
                    {first.map((p) => (
                      <span key={p.label}>
                        <span className="text-muted">{p.label} </span>
                        {p.value}
                      </span>
                    ))}
                  </>
                )}
              </div>

              <div className="flex min-w-40 flex-col gap-1">
                <span className="kicker text-muted">What happened</span>
                {visit.steps.length === 0 ? (
                  <span className="text-muted">looked, and left</span>
                ) : (
                  [...visit.steps]
                    .sort((a, b) => a.at.localeCompare(b.at))
                    .map((s) => (
                      <span key={s.step}>
                        {s.step}
                        <span className="ml-2 text-muted">{shortDateTime(s.at)}</span>
                      </span>
                    ))
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
