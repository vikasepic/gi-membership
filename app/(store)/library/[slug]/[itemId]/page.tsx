import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCourseBySlug, userOwnsCourse } from "@/lib/courses";
import { listCurriculum, getCourseItem } from "@/lib/curriculum";
import { flattenPlayable, neighbours } from "@/lib/curriculum-student";
import { completedItemIds } from "@/lib/progress";
import { CompletionControls } from "@/components/library/completion-controls";
import { AudioPlayer } from "@/components/library/audio-player";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const course = await getCourseBySlug(slug);
  if (!course || !(await userOwnsCourse(user.id, course.id))) redirect("/library");

  const item = await getCourseItem(itemId);
  if (!item || item.courseId !== course.id || !item.isPublished) redirect(`/library/${slug}`);

  // A draft chapter hides everything beneath it.
  if (item.parentId) {
    const parent = await getCourseItem(item.parentId);
    if (!parent?.isPublished) redirect(`/library/${slug}`);
  }

  const nodes = await listCurriculum(course.id);
  const flat = flattenPlayable(nodes);
  const { prev, next } = neighbours(flat, itemId);
  const done = await completedItemIds(user.id, course.id);

  const audio = item.attachments.find((a) => a.mime.startsWith("audio/"));
  const pdf = item.attachments.find((a) => a.mime === "application/pdf");
  const assetUrl = (i: number) => `/api/media/item/${item.id}/${i}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-4">
      <Link href={`/library/${slug}`} className="kicker w-fit text-muted hover:text-fg">
        &larr; {course.title}
      </Link>
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
        (audio ? (
          <AudioPlayer
            src={assetUrl(item.attachments.indexOf(audio))}
            title={audio.name}
          />
        ) : (
          <Notice text="The audio for this lesson hasn't been uploaded yet." />
        ))}

      {item.itemType === "pdf" &&
        (pdf ? (
          <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border">
            <iframe src={assetUrl(item.attachments.indexOf(pdf))} className="h-full w-full" />
          </div>
        ) : (
          <Notice text="The PDF for this lesson hasn't been uploaded yet." />
        ))}

      {item.bodyHtml && (
        <div
          className="flex flex-col gap-4 leading-relaxed [&_a]:text-primary [&_a]:underline [&_h2]:text-xl [&_h3]:text-lg [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
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

      <CompletionControls
        itemId={item.id}
        productId={course.id}
        completed={done.has(item.id)}
        videoUrl={item.itemType === "video" ? item.videoEmbedUrl : null}
        nextHref={next ? `/library/${slug}/${next.id}` : `/library/${slug}`}
      />

      <nav className="flex items-center justify-between border-t border-border pt-6 text-sm">
        {prev ? (
          <Link href={`/library/${slug}/${prev.id}`} className="text-muted hover:text-fg">
            &larr; {prev.title}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/library/${slug}/${next.id}`} className="text-muted hover:text-fg">
            {next.title} &rarr;
          </Link>
        ) : <span />}
      </nav>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 px-5 py-8 text-center text-muted">
      {text}
    </div>
  );
}
