import { AudioPlayer } from "@/components/library/audio-player";
import type { CourseType } from "@/lib/courses";
import type { Attachment } from "@/lib/curriculum";

// Renders a course that has no chapters — it delivers straight from its own
// cover/file/video. What shows follows the course type, and every download goes
// through the ownership-checked media route, never a public path.
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
  const pdf = attachments.find((a) => a.mime === "application/pdf");
  const audio = attachments.find((a) => a.mime.startsWith("audio/"));

  const hasContent = Boolean(videoEmbedUrl) || attachments.length > 0;
  if (!hasContent) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
        This course has no content yet.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-6">
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

      {type === "pdf" && pdf && (
        <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border">
          <iframe src={assetUrl(pdf)} className="h-full w-full" />
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="kicker text-muted">Downloads</h2>
          <ul className="flex flex-col gap-2">
            {attachments.map((a) => (
              <li key={a.path}>
                <a
                  href={assetUrl(a)}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm hover:border-primary"
                >
                  <span>{a.name}</span>
                  <span className="text-muted">Download</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
