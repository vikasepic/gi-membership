"use client";

import { COVER_ASPECT, mb } from "@/lib/cover";
import { CoverPick, useCoverPick } from "@/components/admin/cover-pick";
import { MediaButton, type PickedMedia } from "@/components/admin/media-modal";
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

// Mirrors lib/media.ts. Checked in the browser too so an oversized file is
// refused instantly and visibly, rather than being swallowed by a request-size
// limit somewhere between here and the action. (COVER_MAX lives in lib/cover.ts
// with the rest of what a cover has to be.)
const ATTACH_MAX = 100 * 1024 * 1024;

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
  const { picked, notes, onPickExisting } = useCoverPick();

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
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
          className={`${COVER_ASPECT} w-full max-w-56 self-start rounded-lg border border-border object-cover`}
        />
      )}
      <CoverPick
        picked={picked}
        notes={notes}
        onPickExisting={onPickExisting}
        hasCover={Boolean(coverUrl)}
      />
      {state.error && <p className="text-sm text-primary">{state.error}</p>}
      {state.ok && <p className="text-sm text-navy">Cover updated.</p>}
      <button
        type="submit"
        disabled={pending || !picked}
        className="w-fit rounded-full border border-border bg-surface px-5 py-2 text-sm font-medium transition-colors hover:border-primary disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save cover"}
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
  const [picked, setPicked] = useState<PickedMedia | null>(null);
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

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="courseId" value={courseId} />
        {picked && <input type="hidden" name="mediaId" value={picked.id} />}
        <MediaButton kind="document" onPick={setPicked} label="Select a file" />
        <span className="text-xs text-muted">
          PDF or audio, up to {mb(ATTACH_MAX)}. {picked ? `Chosen: ${picked.name}.` : ""}
        </span>
        {state.error && <p className="text-sm text-primary">{state.error}</p>}
        {state.ok && <p className="text-sm text-navy">Added.</p>}
        <button
          type="submit"
          disabled={pending || !picked}
          className="w-fit rounded-full border border-border bg-surface px-5 py-2 text-sm font-medium transition-colors hover:border-primary disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add file"}
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

