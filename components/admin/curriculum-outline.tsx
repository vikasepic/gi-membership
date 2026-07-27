import Link from "next/link";
import type { CurriculumNode } from "@/lib/curriculum";
import { addChapterAction, addLessonAction, moveItemAction } from "@/app/admin/products/[id]/curriculum/actions";

const pad = (n: number) => String(n + 1).padStart(2, "0");

function MoveButtons({ productId, itemId }: { productId: string; itemId: string }) {
  return (
    <span className="flex items-center gap-1">
      {(["up", "down"] as const).map((dir) => (
        <form action={moveItemAction} key={dir}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="dir" value={dir} />
          <button
            className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-fg"
            aria-label={`Move ${dir}`}
          >
            {dir === "up" ? "↑" : "↓"}
          </button>
        </form>
      ))}
    </span>
  );
}

export function CurriculumOutline({
  productId,
  nodes,
  chapterLabel,
  lessonLabel,
}: {
  productId: string;
  nodes: CurriculumNode[];
  chapterLabel: string;
  lessonLabel: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">Curriculum</h2>
        <form action={addChapterAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="title" value={`New ${chapterLabel}`} />
          <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            + Add {chapterLabel}
          </button>
        </form>
      </div>

      {nodes.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No {chapterLabel.toLowerCase()}s yet. Add one to start building this course.
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {nodes.map((ch, ci) => (
          <li key={ch.id} className="rounded-xl border border-border">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-3">
                <span className="font-display text-muted">{pad(ci)}</span>
                <Link href={`/admin/products/${productId}/curriculum/${ch.id}`} className="hover:underline">
                  {ch.title}
                </Link>
                <span className="text-xs text-muted">
                  {ch.children.length > 0
                    ? `${ch.children.length} ${lessonLabel.toLowerCase()}s`
                    : "content only"}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className={ch.isPublished ? "text-xs text-navy" : "text-xs text-muted"}>
                  {ch.isPublished ? "Published" : "Draft"}
                </span>
                <MoveButtons productId={productId} itemId={ch.id} />
              </span>
            </div>

            <ol className="flex flex-col border-t border-border">
              {ch.children.map((ls, li) => (
                <li key={ls.id} className="flex items-center justify-between gap-3 px-4 py-2 pl-10">
                  <span className="flex items-center gap-3 text-sm">
                    <span className="font-display text-muted">{pad(li)}</span>
                    <Link
                      href={`/admin/products/${productId}/curriculum/${ls.id}`}
                      className="hover:underline"
                    >
                      {ls.title}
                    </Link>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={ls.isPublished ? "text-xs text-navy" : "text-xs text-muted"}>
                      {ls.isPublished ? "Published" : "Draft"}
                    </span>
                    <MoveButtons productId={productId} itemId={ls.id} />
                  </span>
                </li>
              ))}
            </ol>

            <form action={addLessonAction} className="border-t border-border px-4 py-2 pl-10">
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="parentId" value={ch.id} />
              <input type="hidden" name="title" value={`New ${lessonLabel}`} />
              <button className="text-sm text-primary hover:underline">+ Add {lessonLabel}</button>
            </form>
          </li>
        ))}
      </ol>
    </section>
  );
}
