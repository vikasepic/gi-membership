import Link from "next/link";
import { listCourses } from "@/lib/courses";
import { listCurriculum } from "@/lib/curriculum";
import { publicCoverUrl } from "@/lib/media-url";

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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => {
            // The cover drives the storefront picture for every product selling
            // this course. The list used to say "cover set" in grey — a fact
            // about a picture, printed where the picture could have gone. Now
            // it shows the thing, so a wrong crop or a stale image is visible
            // from here rather than only after opening four courses.
            const cover = publicCoverUrl(c.coverPath);
            return (
              <Link
                key={c.id}
                href={`/admin/courses/${c.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-[border-color,box-shadow] hover:border-primary hover:shadow-sm"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-canvas">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    // Not a grey box: the thing that is missing, said plainly,
                    // in the space it would occupy.
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 border-b border-dashed border-border text-center">
                      <span className="text-sm text-primary">No cover image</span>
                      <span className="text-xs text-muted">Add one to give this a picture on the store</span>
                    </div>
                  )}
                  <span
                    className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.1em] backdrop-blur ${
                      c.status === "published"
                        ? "bg-navy/85 text-white"
                        : "bg-white/85 text-ink ring-1 ring-border"
                    }`}
                  >
                    {c.status === "published" ? "Published" : "Draft"}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-1.5 p-5">
                  <span className="text-lg leading-snug">{c.title}</span>
                  {c.subtitle && (
                    <span className="line-clamp-2 text-sm leading-relaxed text-muted">{c.subtitle}</span>
                  )}
                  <span className="mt-auto pt-3 text-xs text-muted">
                    {counts[i]} {counts[i] === 1 ? "item" : "items"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
