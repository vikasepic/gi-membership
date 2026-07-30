import { AudioPlayer } from "@/components/library/audio-player";
import type { CourseType } from "@/lib/courses";
import type { Attachment } from "@/lib/curriculum";

const kb = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

// The deliverable for a course with no chapters.
//
// There is deliberately NO inline PDF viewer. A browser's built-in PDF frame is
// a slow, ugly, non-responsive box that reads as an unstyled iframe dropped into
// the page — and it competes with the one thing this page exists to do, which is
// hand over the file. A clear download does that better on every device,
// especially phones, where the embedded viewer is close to unusable.
//
// Video and audio still play inline, because for those the media IS the lesson.
export function SimpleCourseContent({
  courseId,
  type,
  videoEmbedUrl,
  attachments,
}: {
  courseId: string;
  type: CourseType;
  videoEmbedUrl: string | null;
  attachments: Attachment[];
}) {
  const assetUrl = (a: Attachment) => `/api/media/course/${courseId}/${attachments.indexOf(a)}`;
  const audio = attachments.find((a) => a.mime.startsWith("audio/"));
  const primary = attachments[0];

  if (!videoEmbedUrl && attachments.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-5 py-8 text-muted">
        This course has no content yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {type === "video" && videoEmbedUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border">
          <iframe
            src={videoEmbedUrl}
            className="h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {type === "audio" && audio && <AudioPlayer src={assetUrl(audio)} title={audio.name} />}

      {/* The primary file gets a real button — it is the point of the page.
          Anything else is listed quietly underneath. */}
      {primary && type !== "audio" && (
        <a
          href={assetUrl(primary)}
          className="flex w-fit items-center gap-2.5 rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          <DownloadIcon />
          Download {type === "pdf" ? "the guide" : "the file"}
          <span className="text-primary-fg/70">({kb(primary.size)})</span>
        </a>
      )}

      {attachments.length > (type === "audio" ? 0 : 1) && (
        <section className="flex flex-col gap-2">
          <h2 className="kicker text-muted">
            {attachments.length > 1 ? "All files" : "Download"}
          </h2>
          <ul className="flex flex-col gap-2">
            {attachments
              .filter((a) => type === "audio" || a !== primary)
              .map((a) => (
                <li key={a.path}>
                  <a
                    href={assetUrl(a)}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm transition-colors hover:border-primary"
                  >
                    <span className="min-w-0 truncate">{a.name}</span>
                    <span className="shrink-0 text-muted">{kb(a.size)}</span>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M12 3v12M7 11l5 5 5-5M4 21h16" />
    </svg>
  );
}
