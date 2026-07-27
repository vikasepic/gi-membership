import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProduct } from "@/lib/library";
import { listCurriculum, getCourseItem } from "@/lib/curriculum";
import { flattenPlayable, neighbours } from "@/lib/curriculum-student";
import { completedItemIds } from "@/lib/progress";
import { CompletionControls } from "@/components/library/completion-controls";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ownership is enforced here — getOwnedProduct returns null if not owned.
  const product = await getOwnedProduct(user.id, slug);
  if (!product) redirect("/library");

  // getCourseItem is not published-filtered on its own, so publication and
  // product ownership are both re-checked here before rendering anything.
  const item = await getCourseItem(itemId);
  if (!item || item.productId !== product.id || !item.isPublished) {
    redirect(`/library/${slug}`);
  }
  // A draft chapter hides everything beneath it: buildTree drops the lesson
  // from the curriculum outline as an orphan, but the lesson row itself can
  // still be published, so its direct URL and attachments must be blocked too.
  if (item.parentId) {
    const parent = await getCourseItem(item.parentId);
    if (!parent || !parent.isPublished) redirect(`/library/${slug}`);
  }

  const nodes = await listCurriculum(product.id);
  const flat = flattenPlayable(nodes);
  const { prev, next } = neighbours(flat, itemId);
  const done = await completedItemIds(user.id, product.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-4">
      <Link href={`/library/${slug}`} className="kicker w-fit text-muted hover:text-fg">
        &larr; {product.title}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">{item.title}</h1>
        {item.subtitle && <p className="text-muted">{item.subtitle}</p>}
      </div>

      {item.videoEmbedUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border">
          <iframe
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
                  href={`/api/media/item/${item.id}/${i}`}
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
        productId={product.id}
        completed={done.has(item.id)}
        videoUrl={item.videoEmbedUrl}
        nextHref={next ? `/library/${slug}/${next.id}` : `/library/${slug}`}
      />

      <nav className="flex items-center justify-between border-t border-border pt-6 text-sm">
        {prev ? (
          <Link href={`/library/${slug}/${prev.id}`} className="text-muted hover:text-fg">
            &larr; {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/library/${slug}/${next.id}`} className="text-muted hover:text-fg">
            {next.title} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
