import Link from "next/link";
import { RichText } from "@/components/editor/rich-text";
import { inputClass as input, Field } from "@/components/admin/form-controls";
import { publicCoverUrl } from "@/lib/media";
import type { CourseItem } from "@/lib/curriculum";
import {
  saveItemAction,
  deleteItemAction,
  uploadAttachmentAction,
  removeAttachmentAction,
} from "@/app/admin/products/[id]/curriculum/actions";

// YouTube and Vimeo expose playback position cross-origin; other providers do
// not, so their items complete on the dwell timer instead. Say so in the UI
// rather than letting it look broken.
function trackingNote(url: string | null): string {
  if (!url) return "";
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(url)
    ? "Progress tracking: supported — completes at 50% watched."
    : "Progress tracking: unsupported for this provider — completes on time-on-page instead.";
}

export function ItemEditor({
  item,
  productId,
  kindLabel,
  childCount,
}: {
  item: CourseItem;
  productId: string;
  kindLabel: string;
  childCount: number;
}) {
  const cover = publicCoverUrl(item.coverPath);
  return (
    <div className="flex flex-col gap-8">
      <form action={saveItemAction} className="flex flex-col gap-6">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="itemId" value={item.id} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={`${kindLabel} title`} required>
            <input name="title" defaultValue={item.title} required className={input} />
          </Field>
          <Field label="Subtitle" hint="optional">
            <input name="subtitle" defaultValue={item.subtitle ?? ""} className={input} />
          </Field>
        </div>

        <Field label="Video URL" hint="Vimeo, YouTube or Loom — embed only">
          <input name="videoEmbedUrl" defaultValue={item.videoEmbedUrl ?? ""} className={input} />
        </Field>
        {item.videoEmbedUrl && (
          <p className="-mt-3 text-xs text-muted">{trackingNote(item.videoEmbedUrl)}</p>
        )}

        <Field label="Body">
          <RichText name="bodyHtml" value={item.bodyHtml ?? ""} />
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={item.isPublished}
            className="size-4 accent-[var(--primary)]"
          />
          Published (visible to students)
        </label>

        <div className="flex items-center gap-4">
          <button className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg hover:bg-primary-hover">
            Save changes
          </button>
          <Link href={`/admin/products/${productId}`} className="text-sm text-muted hover:text-fg">
            Back to curriculum
          </Link>
        </div>
      </form>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Cover image</span>
        {cover && <img src={cover} alt="" className="h-32 w-auto rounded-lg border border-border" />}
        <form action="/api/media/cover" method="post" encType="multipart/form-data" className="flex flex-col gap-3">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="file" name="file" accept="image/*" className="text-sm" />
          <button className="w-fit rounded-full border border-border px-5 py-2 text-sm hover:border-primary">
            Upload cover
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Attachments</span>
        {item.attachments.length === 0 && <p className="text-sm text-muted">No files yet.</p>}
        <ul className="flex flex-col gap-2">
          {item.attachments.map((a) => (
            <li key={a.path} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="truncate">{a.name}</span>
              <form action={removeAttachmentAction}>
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="path" value={a.path} />
                <button className="text-xs text-muted hover:text-primary">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={uploadAttachmentAction} className="flex flex-col gap-3">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="file" name="file" className="text-sm" />
          <button className="w-fit rounded-full border border-border px-5 py-2 text-sm hover:border-primary">
            Add file
          </button>
        </form>
      </section>

      <form action={deleteItemAction} className="border-t border-border pt-6">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="itemId" value={item.id} />
        <button className="text-sm text-muted hover:text-primary">
          Delete this {kindLabel.toLowerCase()}
          {childCount > 0 && ` and its ${childCount} child item(s) and their progress`}
        </button>
      </form>
    </div>
  );
}
