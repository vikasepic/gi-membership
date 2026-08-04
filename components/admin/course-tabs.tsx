"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The three jobs a course has, kept apart.
 *
 * Building the curriculum, writing what a buyer reads, and uploading files are
 * different sittings with different save behaviour — the curriculum writes as
 * you go, details need an explicit Save. Stacked on one page that difference is
 * invisible and the Save button quietly lies about its scope.
 */
const TABS = [
  { href: "", label: "Curriculum" },
  { href: "/details", label: "Details" },
  { href: "/files", label: "Cover & files" },
] as const;

export function CourseTabs({ courseId }: { courseId: string }) {
  const path = usePathname();
  const base = `/admin/courses/${courseId}`;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Course">
      {TABS.map((t) => {
        const href = `${base}${t.href}`;
        const on = t.href === "" ? path === base : path.startsWith(href);
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              on ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
