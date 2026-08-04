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
        // Fixed 16:10 box, matching the catalog card, so this preview shows the
        // crop buyers will actually see. It also has to be `self-start`: a bare
        // <img> in a flex column inherits align-items:stretch, which forces its
        // width to the container while h-32 pins the height — that is what made
        // every preview look squashed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          className="aspect-[16/10] w-full max-w-56 self-start rounded-lg border border-border object-cover"
        />
      )}
      <FilePick
        accept="image/*"
        hint={`JPG or PNG, up to ${mb(COVER_MAX)}.`}
        label={coverUrl ? "Choose a replacement" : "Choose an image"}
        onChange={check}
      />
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
        <FilePick
          accept="application/pdf,audio/*"
          hint={`PDF or audio, up to ${mb(ATTACH_MAX)}.`}
          label="Choose a file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setTooBig(f && f.size > ATTACH_MAX ? `That file is ${mb(f.size)}. The limit is ${mb(ATTACH_MAX)}.` : null);
          }}
        />
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

/**
 * Pick a file without the browser's own control.
 *
 * A visible <input type="file"> renders the platform's button plus the words
 * "No file chosen", which cannot be styled and reads as unfinished next to
 * everything around it. The input still does the work; a label drives it and
 * the chosen name is shown here instead.
 */
function FilePick({
  accept,
  hint,
  label,
  onChange,
}: {
  accept: string;
  hint: string;
  label: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="w-fit cursor-pointer rounded-full border border-border bg-surface px-4 py-2 text-sm transition-colors hover:border-fg">
          {label}
          <input
            type="file"
            name="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              setName(e.target.files?.[0]?.name ?? null);
              onChange(e);
            }}
          />
        </label>
        <span className="min-w-0 truncate text-sm text-muted">{name ?? "Nothing chosen yet"}</span>
      </div>
      <span className="text-xs text-muted">{hint}</span>
    </div>
  );
}
