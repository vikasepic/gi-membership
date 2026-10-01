"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A table row that opens `href` when clicked anywhere plain on it.
 *
 * Anything inside that does its own job (the Refund button, a link, a field)
 * keeps it. A modified click (new tab) and a click that ends a text
 * selection are left alone too. The person's name stays a real link, so the
 * row is reachable by keyboard and opens in a new tab like any link.
 */
export function ClickableRow({ href, className = "", children }: { href: string | null; className?: string; children: ReactNode }) {
  const router = useRouter();
  // No member behind the row (a guest checkout): an ordinary row.
  if (!href) return <tr className={className}>{children}</tr>;
  return (
    <tr
      className={`cursor-pointer ${className}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label, form")) return;
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
