"use client";

import { useSlowSave } from "@/components/admin/save-status";
import { useActionState, useState } from "react";
import { saveCourseAction, deleteCourseAction, type SaveState } from "@/app/admin/courses/actions";
import { inputClass, Field, Section } from "@/components/admin/form-controls";
import { slugify, slugDraft } from "@/lib/slug";
import type { Course } from "@/lib/courses";

const SLUG_RE = /^[a-z0-9-]+$/;

// Client-side checks for the two fields that have real rules. They run before
// the form is ever submitted, so a bad title or slug is flagged inline with no
// round trip and no reload. The server re-validates and owns the one thing the
// client can't know: whether the slug is already taken.
function clientErrors(title: string, slug: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!title.trim()) e.title = "Title required";
  if (!slug.trim()) e.slug = "Slug required";
  else if (!SLUG_RE.test(slug)) e.slug = "Use lowercase letters, numbers and hyphens only";
  return e;
}

function invalid(cls: string, hasError: boolean) {
  return hasError ? `${cls} border-primary` : cls;
}

export function CourseForm({ course }: { course?: Course }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCourseAction, {});
  const slow = useSlowSave(pending);

  const [title, setTitle] = useState(course?.title ?? "");
  const [slug, setSlug] = useState(course?.slug ?? "");
  // Until someone edits the slug themselves, it tracks the title. A saved course
  // already has a slug people may have linked to, so we never auto-touch that.
  const [slugEdited, setSlugEdited] = useState(Boolean(course));
  const [clientErr, setClientErr] = useState<Record<string, string>>({});
  // Held in state rather than left uncontrolled, so the hint under it can say
  // what the CHOSEN state means rather than what the saved one did.
  const [status, setStatus] = useState<"draft" | "published">(course?.status ?? "draft");

  // A field's own client error wins; otherwise fall back to whatever the server
  // returned. Editing a field clears its client error to "", so `||` (not `??`)
  // is required — an empty string must let the server error show through.
  const err = (name: string) => clientErr[name] || state.errors?.[name];

  function onTitle(v: string) {
    setTitle(v);
    setClientErr((c) => ({ ...c, title: "" }));
    if (!slugEdited) setSlug(slugify(v));
  }

  function onSlug(v: string) {
    // Normalise as they type so the field can only ever hold a valid slug.
    setSlug(slugDraft(v));
    setSlugEdited(true);
    setClientErr((c) => ({ ...c, slug: "" }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Delete has its own action and must not be blocked by save-validation.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter?.dataset.action === "delete") return;

    const errs = clientErrors(title, slug);
    if (Object.keys(errs).length > 0) {
      e.preventDefault(); // stops the server action — no submit, no reload
      setClientErr(errs);
    }
  }

  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {course && <input type="hidden" name="id" value={course.id} />}

      <Section title="About this course" hint="What students see before and inside it.">
        {/* First, and its own row.
            It used to sit under "Format & vocabulary" beside the Type select,
            which is where nobody looked — publishing is not vocabulary, and
            people concluded the course was stuck on Draft because the control
            was two sections below the thing telling them so. `id` so the badge
            in the header can link straight here. */}
        <Field
          label="Status"
          required
          hint={
            status === "published"
              ? "Students with access can open it."
              : "Hidden from students — nobody can open it, even if they own the product that grants it."
          }
        >
          <select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={inputClass}
          >
            <option value="draft">Draft — hidden from students</option>
            <option value="published">Published</option>
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Title" required error={err("title")}>
            <input
              name="title"
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              className={invalid(inputClass, Boolean(err("title")))}
            />
          </Field>
          <Field label="Slug" required hint="lowercase-with-hyphens" error={err("slug")}>
            <input
              name="slug"
              value={slug}
              onChange={(e) => onSlug(e.target.value)}
              // The trailing hyphen is allowed while typing and tidied the
              // moment the field is left, so nothing half-written is saved.
              onBlur={(e) => setSlug(slugify(e.target.value))}
              className={invalid(inputClass, Boolean(err("slug")))}
            />
          </Field>
        </div>
        <Field label="Subtitle" hint="one line under the title">
          <input name="subtitle" defaultValue={course?.subtitle ?? ""} className={inputClass} />
        </Field>
        <Field label="Description">
          <textarea name="description" defaultValue={course?.description ?? ""} rows={4} className={inputClass} />
        </Field>
      </Section>

      <Section
        title="Format & vocabulary"
        hint="Type sets the badge students see. Some courses call their parts Modules and Sessions rather than Chapters and Lessons — yours can say whatever fits."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Type" required hint="what this course mostly is">
            <select name="type" defaultValue={course?.type ?? "video"} className={inputClass}>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="pdf">PDF / Guide</option>
              <option value="text">Text / Reading</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Call chapters" hint="e.g. Module">
            <input name="chapterLabel" defaultValue={course?.chapterLabel ?? "Chapter"} className={inputClass} />
          </Field>
          <Field label="Call lessons" hint="e.g. Session">
            <input name="lessonLabel" defaultValue={course?.lessonLabel ?? "Lesson"} className={inputClass} />
          </Field>
        </div>
      </Section>

      {state.errors?._form && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.errors._form}
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
      {slow && (
        <p className="text-xs text-primary" role="status">
          Still going. It may already have worked — reload to check.
        </p>
      )}
        {course && (
          <button
            type="submit"
            formAction={deleteCourseAction}
            data-action="delete"
            className="text-sm text-muted hover:text-fg"
          >
            Delete course
          </button>
        )}
      </div>
    </form>
  );
}
