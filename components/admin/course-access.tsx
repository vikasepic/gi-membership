"use client";

import { useActionState } from "react";
import { useSlowSave } from "@/components/admin/save-status";
import { inputClass as input } from "@/components/admin/form-controls";
import { addCourseAccessAction, type CourseAccessState } from "@/app/admin/courses/[id]/(tabs)/access/actions";

/** Give one person this one course, by email. Same shape as Add member. */
export function AddCourseAccess({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState<CourseAccessState, FormData>(addCourseAccessAction, {});
  const slow = useSlowSave(pending);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex flex-col gap-1">
        <span className="font-medium">Add someone to this course</span>
        <span className="text-sm text-muted">
          Gives them this course only, no product or offer. A new email becomes a member who signs in with a
          magic link. Nothing is emailed to them.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="email" type="email" required placeholder="Email" className={input} />
        <input name="fullName" placeholder="Full name (optional)" className={input} />
      </div>
      {state.error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">{state.error}</p>
      )}
      {state.message && (
        <p className="rounded-xl border border-navy/30 bg-navy/5 px-4 py-3 text-sm text-navy">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {slow && (
        <p className="text-xs text-primary" role="status">
          Still going. It may already have worked, reload to check.
        </p>
      )}
    </form>
  );
}
