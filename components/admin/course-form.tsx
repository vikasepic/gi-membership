"use client";

import { useActionState } from "react";
import { saveCourseAction, deleteCourseAction, type SaveState } from "@/app/admin/courses/actions";
import { inputClass as input, Field, Section } from "@/components/admin/form-controls";
import type { Course } from "@/lib/courses";

export function CourseForm({ course }: { course?: Course }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCourseAction, {});

  return (
    <form action={action} className="flex flex-col gap-6">
      {course && <input type="hidden" name="id" value={course.id} />}

      <Section title="About this course" hint="What students see before and inside it.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Title" required>
            <input name="title" defaultValue={course?.title ?? ""} required className={input} />
          </Field>
          <Field label="Slug" required hint="lowercase-with-hyphens">
            <input name="slug" defaultValue={course?.slug ?? ""} required className={input} />
          </Field>
        </div>
        <Field label="Subtitle" hint="one line under the title">
          <input name="subtitle" defaultValue={course?.subtitle ?? ""} className={input} />
        </Field>
        <Field label="Description">
          <textarea name="description" defaultValue={course?.description ?? ""} rows={4} className={input} />
        </Field>
      </Section>

      <Section
        title="Vocabulary"
        hint="Some courses have Modules and Sessions, others Weeks and Days. Yours can say whatever fits."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Call chapters" hint="e.g. Module">
            <input name="chapterLabel" defaultValue={course?.chapterLabel ?? "Chapter"} className={input} />
          </Field>
          <Field label="Call lessons" hint="e.g. Session">
            <input name="lessonLabel" defaultValue={course?.lessonLabel ?? "Lesson"} className={input} />
          </Field>
          <Field label="Status" required>
            <select name="status" defaultValue={course?.status ?? "draft"} className={input}>
              <option value="draft">Draft — hidden from students</option>
              <option value="published">Published</option>
            </select>
          </Field>
        </div>
      </Section>

      {state.error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : course ? "Save course" : "Create course"}
        </button>
        {course && (
          <button
            type="submit"
            formAction={deleteCourseAction}
            className="text-sm text-muted hover:text-fg"
          >
            Delete course
          </button>
        )}
      </div>
    </form>
  );
}
