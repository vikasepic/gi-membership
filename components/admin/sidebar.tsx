"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavCounts } from "@/lib/admin-nav";

// The admin navigation.
//
// Nine links in a flat row asked you to scan all nine every time, and put
// Errors — a debug surface — at the same level as Orders. They are not peers:
// Products, Courses and Offers are what the store sells; Orders and Members are
// who bought; Apps, Errors and Settings are how it runs.
//
// The counts are why this is worth 216px. "Apps 1/2" says one app is not set up
// without going to look, and Errors is a page nobody would otherwise open.

type Item = { href: string; label: string; badge?: string; warn?: boolean };

function groups(c: NavCounts): { title: string; items: Item[] }[] {
  const n = (v: number) => (v > 0 ? String(v) : undefined);
  return [
    {
      title: "Catalogue",
      items: [
        { href: "/admin", label: "Products", badge: n(c.products) },
        { href: "/admin/courses", label: "Courses", badge: n(c.courses) },
        { href: "/admin/offers", label: "Offers", badge: n(c.offers) },
      ],
    },
    {
      title: "Customers",
      items: [
        { href: "/admin/orders", label: "Orders", badge: n(c.orders) },
        { href: "/admin/members", label: "Members", badge: n(c.members) },
      ],
    },
    {
      title: "System",
      items: [
        {
          href: "/admin/apps",
          label: "Apps",
          badge: c.apps.total ? `${c.apps.active}/${c.apps.total}` : undefined,
          // An app that is not connected sells nothing, which is worth seeing
          // from the navigation rather than from the page.
          warn: c.apps.total > c.apps.active,
        },
        { href: "/admin/errors", label: "Errors", badge: n(c.errors), warn: c.errors > 0 },
        { href: "/admin/settings", label: "Settings" },
      ],
    },
  ];
}

export function AdminSidebar({ counts, live }: { counts: NavCounts; live: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // "/admin" is a prefix of every other admin route, so it can only match
  // exactly — otherwise Products stays lit on all nine pages.
  const isOn = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  const nav = (
    <nav className="flex h-full flex-col gap-0.5 p-3" aria-label="Admin">
      {groups(counts).map((g) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          <span className="px-2.5 pb-1 pt-4 text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-white/55">
            {g.title}
          </span>
          {g.items.map((i) => {
            const on = isOn(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  on ? "bg-white font-medium text-navy" : "text-white/85 hover:bg-white/10"
                }`}
              >
                {i.label}
                {i.badge && (
                  <span
                    className={`ml-auto text-xs tabular-nums ${
                      i.warn
                        ? "rounded-full bg-[#f0c98a] px-1.5 font-semibold text-[#5b3708]"
                        : on
                          ? "text-navy/60"
                          : "text-white/60"
                    }`}
                  >
                    {i.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-1 border-t border-white/15 pt-3">
        {/* Which Stripe mode this store is running. It has to stay visible —
            the dangerous state is not knowing which set of orders you are
            looking at — but it does not need to be the loudest thing on the
            screen, which is what a filled pill beside the logo made it. */}
        <span className="flex items-center gap-2 px-2.5 py-1 text-xs text-white/70">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${live ? "bg-[#7ee0a8]" : "bg-white/40"}`}
          />
          {live ? "Live payments" : "Stripe test mode"}
        </span>
        <Link href="/" className="rounded-lg px-2.5 py-1.5 text-sm text-white/85 hover:bg-white/10">
          View store &rarr;
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      {/* Phone: a bar with a toggle, because 216px of permanent navigation on a
          390px screen leaves no room for the thing you came to do. */}
      <div className="flex items-center gap-3 border-b border-border bg-navy px-4 py-2.5 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="admin-nav"
          className="rounded-lg border border-white/25 px-2.5 py-1 text-sm"
        >
          Menu
        </button>
        <span className="font-medium">Admin</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-white/70">
          <span aria-hidden className={`size-1.5 rounded-full ${live ? "bg-[#7ee0a8]" : "bg-white/40"}`} />
          {live ? "Live" : "Test"}
        </span>
      </div>
      <div id="admin-nav" className={`bg-navy lg:hidden ${open ? "" : "hidden"}`}>
        {nav}
      </div>
      <aside className="sticky top-0 hidden h-dvh w-[216px] shrink-0 bg-navy lg:block">{nav}</aside>
    </>
  );
}
