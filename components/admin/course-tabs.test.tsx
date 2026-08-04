// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let path = "/admin/courses/c1";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
const { CourseTabs } = await import("@/components/admin/course-tabs");

const render = (at: string) => {
  path = at;
  return renderToStaticMarkup(<CourseTabs courseId="c1" />);
};

describe("the course tabs", () => {
  it("offers the three jobs a course has", () => {
    const out = render("/admin/courses/c1");
    for (const t of ["Curriculum", "Details", "Cover &amp; files"]) expect(out).toContain(t);
  });

  it("links each to its own route", () => {
    const out = render("/admin/courses/c1");
    expect(out).toContain('href="/admin/courses/c1"');
    expect(out).toContain('href="/admin/courses/c1/details"');
    expect(out).toContain('href="/admin/courses/c1/files"');
  });

  it("marks the current tab for a screen reader, not only with colour", () => {
    expect(render("/admin/courses/c1")).toContain('aria-current="page"');
  });

  it("does not mark Curriculum as current while on another tab", () => {
    // The one that breaks with a naive startsWith: every tab's path starts
    // with the course's own.
    const out = render("/admin/courses/c1/details");
    const current = out.split("</a>").find((chunk) => chunk.includes('aria-current="page"'));
    expect(current).toContain("Details");
    expect(current).not.toContain("Curriculum");
  });

  it("keeps a tab current on a page nested under it", () => {
    const out = render("/admin/courses/c1/files/anything");
    const current = out.split("</a>").find((chunk) => chunk.includes('aria-current="page"'));
    expect(current).toContain("Cover &amp; files");
  });

  it("marks exactly one tab current", () => {
    for (const at of ["/admin/courses/c1", "/admin/courses/c1/details", "/admin/courses/c1/files"]) {
      expect(render(at).match(/aria-current="page"/g), at).toHaveLength(1);
    }
  });
});
