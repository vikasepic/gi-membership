"use client";

import { useActionState, useState } from "react";
import {
  uploadCourseCoverAction,
  uploadCourseFileAction,
  removeCourseFileAction,
  saveCourseVideoAction,
  type ContentState,
} from "@/app/admin/courses/[id]/content/actions";
import { Section, inputClass } from "@/components/admin/form-controls";
import type { Course } from "@/lib/courses";

// Mirrors lib/media.ts. Checked here too so an oversized file is refused
// instantly and visibly, rather than being swallowed by a request-size limit
// somewhere between the browser and the action.
const COVER_MAX = 5 * 1024 * 1024;
const ATTACH_MAX = 100 * 1024 * 1024;
const mb = (n: number) => `${Math.round(n / 1024 / 1024)}MB`;

// The "simple course" editor: everything a course needs when it has no chapters
// — a cover image, the file people download (or a video URL), and that's it.
// Shown above the curriculum on the course page; a course uses whichever it has.
// coverUrl is resolved server-side (lib/media is server-only) and passed in.
export function CourseContent({
  course,
  coverUrl,
  hasCurriculum,
}: {
  course: Course;
  coverUrl: string | null;
  hasCurriculum: boolean;
}) {
  const wantsVideo = course.type === "video";

  return (
    <Section
      title="Course content"
      hint={
        hasCurriculum
          ? "This course has chapters below, so students see those. The cover still shows at the top."
          : "A simple course delivers straight from here — no chapters needed. Students see the cover, the description, and this file to download."
      }
    >
      <CoverBlock courseId={course.id} coverUrl={coverUrl} />

      {wantsVideo ? (
        <VideoBlock courseId={course.id} current={course.videoEmbedUrl} />
      ) : (
        <FileBlock courseId={course.id} attachments={course.attachments} />
      )}
    </Section>
  );
}

function CoverBlock({ courseId, coverUrl }: { courseId: string; coverUrl: string | null }) {
  const [state, action, pending] = useActionState<ContentState, FormData>(uploadCourseCoverAction, {});
  const [tooBig, setTooBig] = useState<string | null>(null);

  function check(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setTooBig(f && f.size > COVER_MAX ? `That image is ${mb(f.size)}. Covers must be under ${mb(COVER_MAX)}.` : null);
  }

  return (
    <form
      action={action}
      onSubmit={(e) => { if (tooBig) e.preventDefault(); }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <span className="text-sm font-medium">Cover image</span>
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="h-32 w-auto rounded-lg border border-border" />
      )}
      <input
        type="file"
        name="file"
        accept="image/*"
        onChange={check}
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:text-fg"
      />
      <span className="text-xs text-muted">JPG or PNG, up to {mb(COVER_MAX)}.</span>
      {tooBig && <p className="text-sm text-primary">{tooBig}</p>}
      {state.error && <p className="text-sm text-primary">{state.error}</p>}
      {state.ok && <p className="text-sm text-navy">Cover updated.</p>}
      <button
        type="submit"
        disabled={pending || Boolean(tooBig)}
        className="w-fit rounded-full border border-border bg-surface px-5 py-2 text-sm font-medium transition-colors hover:border-primary disabled:opacity-60"
      >
        {pending ? "Uploading…" : coverUrl ? "Replace cover" : "Upload cover"}
      </button>
    </form>
  );
}

function FileBlock({
  courseId,
  attachments,
}: {
  courseId: string;
  attachments: Course["attachments"];
}) {
  const [state, action, pending] = useActionState<ContentState, FormData>(uploadCourseFileAction, {});
  const [tooBig, setTooBig] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
      <span className="text-sm font-medium">Downloadable file</span>

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attachments.map((a) => (
            <li
              key={a.path}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="truncate">{a.name}</span>
              <form action={removeCourseFileAction}>
                <input type="hidden" name="courseId" value={courseId} />
                <input type="hidden" name="path" value={a.path} />
                <button className="text-xs text-muted hover:text-primary">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={action}
        onSubmit={(e) => { if (tooBig) e.preventDefault(); }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="courseId" value={courseId} />
        <input
          type="file"
          name="file"
          accept="application/pdf,audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setTooBig(f && f.size > ATTACH_MAX ? `That file is ${mb(f.size)}. The limit is ${mb(ATTACH_MAX)}.` : null);
          }}
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:text-fg"
        />
        <span className="text-xs text-muted">PDF or audio, up to {mb(ATTACH_MAX)}.</span>
        {tooBig && <p className="text-sm text-primary">{tooBig}</p>}
        {state.error && <p className="text-sm text-primary">{state.error}</p>}
        {state.ok && <p className="text-sm text-navy">Uploaded.</p>}
        <button
          type="submit"
          disabled={pending || Boolean(tooBig)}
          className="w-fit rounded-full border border-border bg-surface px-5 py-2 text-sm font-medium transition-colors hover:border-primary disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload file"}
        </button>
      </form>
    </div>
  );
}

function VideoBlock({ courseId, current }: { courseId: string; current: string | null }) {
  const [state, action, pending] = useActionState<ContentState, FormData>(saveCourseVideoAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
      <input type="hidden" name="courseId" value={courseId} />
      <span className="text-sm font-medium">Video embed URL</span>
      <input
        name="videoEmbedUrl"
        defaultValue={current ?? ""}
        placeholder="https://www.youtube.com/embed/…"
        className={inputClass}
      />
      {state.error && <p className="text-sm text-primary">{state.error}</p>}
      {state.ok && <p className="text-sm text-navy">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full border border-border bg-surface px-5 py-2 text-sm font-medium transition-colors hover:border-primary disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save video"}
      </button>
    </form>
  );
}
