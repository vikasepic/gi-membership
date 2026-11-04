import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourse } from "@/lib/courses";
import { listCourseAccess } from "@/lib/course-access";
import { AddCourseAccess } from "@/components/admin/course-access";
import { Th, Empty, fmtDate } from "@/components/admin/money-ui";
import { removeCourseAccessAction, giveBackCourseAccessAction } from "./actions";

// Who can open this course, and one person added to or removed from it.
// Spec: docs/superpowers/specs/2026-11-04-course-access-tab-design.md.

const rowButton =
  "whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-fg";

function Person({ userId, name, email }: { userId: string; name: string | null; email: string }) {
  return (
    <Link href={`/admin/members/${userId}`} className="font-medium hover:underline">
      {name || email}
    </Link>
  );
}

export default async function CourseAccessTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [course, { people, removed }] = await Promise.all([getCourse(id), listCourseAccess(id)]);
  if (!course) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-lg">
          {people.length === 1 ? "1 person" : `${people.length} people`} can open this course
        </p>
        {course.status !== "published" && (
          <p className="text-sm text-muted">
            This course is a draft, so nobody on this list can open it until it is published.
          </p>
        )}
      </div>

      <AddCourseAccess courseId={id} />

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-surface-2">
            <tr><Th>Person</Th><Th>Email</Th><Th>How</Th><Th>Since</Th><Th right /></tr>
          </thead>
          <tbody>
            {people.length === 0 ? (
              <tr><td colSpan={5}><Empty>Nobody has this course yet.</Empty></td></tr>
            ) : (
              people.map((p) => (
                <tr key={p.userId} className="border-t border-border align-top hover:bg-surface-2">
                  <td className="px-3 py-3"><Person {...p} /></td>
                  <td className="px-3 py-3 text-muted">{p.email}</td>
                  <td className="px-3 py-3">{p.how.join(", ")}</td>
                  <td className="whitespace-nowrap px-3 py-3">{fmtDate(p.since)}</td>
                  <td className="px-3 py-3 text-right">
                    <form action={removeCourseAccessAction}>
                      <input type="hidden" name="courseId" value={id} />
                      <input type="hidden" name="userId" value={p.userId} />
                      <button type="submit" className={rowButton}>Remove</button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {removed.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg">Removed</h2>
            <p className="text-sm text-muted">
              Taken off this course by hand. Their purchases still stand; Give back lets them in again, and so does
              buying something that includes it.
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-surface-2">
                <tr><Th>Person</Th><Th>Email</Th><Th>Removed by</Th><Th>When</Th><Th right /></tr>
              </thead>
              <tbody>
                {removed.map((r) => (
                  <tr key={r.userId} className="border-t border-border align-top hover:bg-surface-2">
                    <td className="px-3 py-3"><Person {...r} /></td>
                    <td className="px-3 py-3 text-muted">{r.email}</td>
                    <td className="px-3 py-3">{r.removedBy}</td>
                    <td className="whitespace-nowrap px-3 py-3">{fmtDate(r.at)}</td>
                    <td className="px-3 py-3 text-right">
                      <form action={giveBackCourseAccessAction}>
                        <input type="hidden" name="courseId" value={id} />
                        <input type="hidden" name="userId" value={r.userId} />
                        <button type="submit" className={rowButton}>Give back</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
