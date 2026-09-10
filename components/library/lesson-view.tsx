import Link from "next/link";
import { CompletionControls } from "@/components/library/completion-controls";
import { AudioPlayer } from "@/components/library/audio-player";
import { TrackView } from "@/components/track-view";
import type { Course } from "@/lib/courses";
import type { CourseItem } from "@/lib/curriculum";

// One lesson, as a learner sees it.
//
// Extracted from the library route so the admin preview renders THIS rather
// than a copy. Types are imported as types only, so nothing server-only is
// dragged in and the preview can render it in the browser as you type.
//
// `interactive` is the one real difference between the two uses: previewing a
// lesson must not write progress against the admin's own account, so the
// completion control becomes inert rather than being hidden — the button is
// part of what you are checking.

type Neighbour = { id: string; title: string } | null;

export function LessonView({
  course,
  item,
  prev,
  next,
  completed,
  assetUrl,
  lessonHref,
  backHref,
  interactive = true,
}: {
  course: Course;
  item: CourseItem;
  prev: Neighbour;
  next: Neighbour;
  completed: boolean;
  /** Index into item.attachments — the ownership-checked media route. */
  assetUrl: (index: number) => string;
  lessonHref: ((itemId: string) => string) | null;
  backHref: { href: string; label: string } | null;
  interactive?: boolean;
}) {
  // Every source, not just the first. A lesson can be a part one and a part
  // two, or a worksheet and a summary — showing only one silently hides work
  // that was uploaded on purpose.
  const audioSources = [
    ...item.audioUrls.map((src) => ({ src, title: item.title })),
    ...item.attachments
      .filter((a) => a.mime.startsWith("audio/"))
      .map((a) => ({ src: assetUrl(item.attachments.indexOf(a)), title: a.name })),
  ];
  const pdfs = item.attachments
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.mime === "application/pdf");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-4">
      {/* Gated on `interactive` for the same reason the completion control is:
          previewing a lesson is not a student studying it, and counting it as
          one would put the admin's own reading in the course numbers. */}
      {interactive && (
        <TrackView
          event="LessonStarted"
          params={{ content_name: item.title, content_ids: [item.id], course: course.title }}
          stableKey={item.id}
        />
      )}
      {backHref && (
        <Link href={backHref.href} className="kicker w-fit text-muted hover:text-fg">
          &larr; {backHref.label}
        </Link>
      )}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">{item.title}</h1>
        {item.subtitle && <p className="text-muted">{item.subtitle}</p>}
      </div>

      {/* Rendering follows the lesson's own type. */}
      {item.itemType === "video" && item.videoEmbedUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border">
          <iframe
            data-gi-video
            src={
              /youtube\.com|youtu\.be/i.test(item.videoEmbedUrl)
                ? `${item.videoEmbedUrl}${item.videoEmbedUrl.includes("?") ? "&" : "?"}enablejsapi=1`
                : item.videoEmbedUrl
            }
            className="h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {item.itemType === "audio" &&
        (audioSources.length > 0 ? (
          <div className="flex flex-col gap-3">
            {audioSources.map((s) => (
              <AudioPlayer key={s.src} src={s.src} title={s.title} />
            ))}
          </div>
        ) : (
          <Notice text="The audio for this lesson hasn't been added yet." />
        ))}

      {item.itemType === "pdf" &&
        (pdfs.length > 0 ? (
          <div className="flex flex-col gap-4">
            {pdfs.map(({ a, i }) => (
              <div key={a.path} className="flex flex-col gap-1.5">
                {pdfs.length > 1 && <span className="text-sm text-muted">{a.name}</span>}
                <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border">
                  <iframe src={assetUrl(i)} className="h-full w-full" title={a.name} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Notice text="The PDF for this lesson hasn't been uploaded yet." />
        ))}

      {item.bodyHtml && (
        <div
          // Written by a client in an editor, so it holds whatever they pasted:
          // a 90-character URL with no spaces widened the whole page to 1412px
          // on a 375px phone and dragged the bottom nav with it. Long strings
          // break anywhere; images, embeds and tables never exceed the column.
          className="flex min-w-0 flex-col gap-4 leading-relaxed break-words [overflow-wrap:anywhere] [&_a]:text-primary [&_a]:underline [&_h2]:text-xl [&_h3]:text-lg [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_img]:h-auto [&_img]:max-w-full [&_iframe]:max-w-full [&_video]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
        />
      )}

      {item.attachments.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="kicker text-muted">Downloads</h2>
          <ul className="flex flex-col gap-2">
            {item.attachments.map((a, i) => (
              <li key={a.path}>
                <a
                  href={assetUrl(i)}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm hover:border-primary"
                  data-gi-download={item.id}
                >
                  <span>{a.name}</span>
                  <span className="text-muted">Download</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {interactive ? (
        <CompletionControls
          itemId={item.id}
          productId={course.id}
          completed={completed}
          videoUrl={item.itemType === "video" ? item.videoEmbedUrl : null}
          nextHref={next && lessonHref ? lessonHref(next.id) : (backHref?.href ?? "/library")}
        />
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-4">
          <span className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg">
            {completed ? "Completed" : "Mark complete"}
          </span>
          <span className="text-sm text-muted">Inert in a preview — nothing is recorded.</span>
        </div>
      )}

      <nav className="flex items-center justify-between border-t border-border pt-6 text-sm">
        {prev ? (
          <Neighbor n={prev} lessonHref={lessonHref} dir="prev" />
        ) : (
          <span />
        )}
        {next ? <Neighbor n={next} lessonHref={lessonHref} dir="next" /> : <span />}
      </nav>
    </div>
  );
}

function Neighbor({
  n,
  lessonHref,
  dir,
}: {
  n: { id: string; title: string };
  lessonHref: ((id: string) => string) | null;
  dir: "prev" | "next";
}) {
  const label = dir === "prev" ? `← ${n.title}` : `${n.title} →`;
  return lessonHref ? (
    <Link href={lessonHref(n.id)} className="text-muted hover:text-fg">
      {label}
    </Link>
  ) : (
    <span className="text-muted">{label}</span>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-border bg-surface-2 px-5 py-4 text-sm text-muted">
      {text}
    </p>
  );
}
