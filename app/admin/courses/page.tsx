import Link from "next/link";
import { listCourses } from "@/lib/courses";
import { listCurriculum } from "@/lib/curriculum";

// Courses are CONTENT. Products (priced, sold) are a separate section — a
// product grants one or more courses, so a bundle is just a product with several.
export default async function AdminCoursesPage() {
  const courses = await listCourses();
  const counts = await Promise.all(
    courses.map(async (c) => {
      const nodes = await listCurriculum(c.id, { includeDrafts: true });
      return nodes.reduce((n, ch) => n + 1 + ch.children.length, 0);
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl">Courses</h1>
          <p className="text-sm text-muted">
            The content. Attach a course to one or more products to sell it.
          </p>
        </div>
        <Link
          href="/admin/courses/new"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          + New course
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
          No courses yet. Create one, add chapters and lessons, then attach it to a product.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => (
            <Link
              key={c.id}
              href={`/admin/courses/${c.id}`}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary"
            >
              <span className="kicker text-muted">
                {c.status === "published" ? "Published" : "Draft"}
              </span>
              <span className="text-lg">{c.title}</span>
              {c.subtitle && <span className="text-sm text-muted">{c.subtitle}</span>}
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{counts[i]} items</span>
                {/* The cover drives the storefront picture for every product
                    selling this course, so a missing one is worth seeing from
                    the list rather than only after opening the course. */}
                {c.coverPath ? <span>cover set</span> : <span className="text-primary">no cover image</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
