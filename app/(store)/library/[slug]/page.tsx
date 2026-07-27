import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProduct, getProductProgress } from "@/lib/library";
import { markCompleteAction } from "../actions";

export default async function ConsumePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ownership is enforced here — getOwnedProduct returns null if not owned.
  const owned = await getOwnedProduct(user.id, slug);
  if (!owned) redirect("/library");
  const { product, lessons } = owned;
  const progress = await getProductProgress(user.id, product.id);

  const assetUrl = `/api/asset/${product.id}`;
  const hasUpload = product.mediaMode === "upload" && !!product.mediaPath;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-4">
      <div className="flex flex-col gap-2">
        <Link href="/library" className="kicker w-fit text-muted hover:text-fg">&larr; Library</Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl">{product.title}</h1>
          {progress?.completed && (
            <span className="kicker rounded-full bg-navy/10 px-2.5 py-1 text-navy">Completed</span>
          )}
        </div>
        {product.tagline && <p className="text-muted">{product.tagline}</p>}
      </div>

      {/* Delivery by type. Uploads go through the ownership-gated asset route. */}
      {product.type === "video" && product.mediaEmbedUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border">
          <iframe
            src={product.mediaEmbedUrl}
            className="h-full w-full"
            allow="accelerated-encoder; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {product.type === "audio" &&
        (hasUpload ? (
          <audio controls src={assetUrl} className="w-full" />
        ) : (
          <Notice text="Audio hasn't been uploaded yet." />
        ))}

      {product.type === "pdf" &&
        (hasUpload ? (
          <div className="flex flex-col gap-4">
            <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border">
              <iframe src={assetUrl} className="h-full w-full" />
            </div>
            <a href={assetUrl} className="w-fit rounded-full border border-border px-5 py-2.5 text-sm hover:border-primary">
              Download PDF
            </a>
          </div>
        ) : (
          <Notice text="The PDF hasn't been uploaded yet." />
        ))}

      {product.type === "app" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
          <p className="text-muted">Open this in the connected app.</p>
          {/* ponytail: handoff token flow is phase 5 (app bridge). */}
          <button disabled className="w-fit cursor-not-allowed rounded-full bg-surface-2 px-5 py-2.5 text-sm text-muted">
            Open the app (coming soon)
          </button>
        </div>
      )}

      {product.description && (
        <section className="flex flex-col gap-2 border-t border-border pt-6">
          <h2 className="kicker text-muted">About</h2>
          <p className="whitespace-pre-line leading-relaxed text-fg/90">{product.description}</p>
        </section>
      )}

      {lessons.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="kicker text-muted">Lessons</h2>
          <ol className="flex flex-col gap-2">
            {lessons.map((l, i) => (
              <li key={l.id} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                <span className="font-display text-muted">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex flex-col">
                  <span>{l.title}</span>
                  {l.subtitle && <span className="text-sm text-muted">{l.subtitle}</span>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!progress?.completed && (
        <form action={markCompleteAction}>
          <input type="hidden" name="productId" value={product.id} />
          <button className="w-fit rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover">
            Mark as complete
          </button>
        </form>
      )}
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
