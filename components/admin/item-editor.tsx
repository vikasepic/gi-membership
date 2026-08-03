import Link from "next/link";
import { DeleteItemButton } from "@/components/admin/delete-item-button";
import { LessonTypeFields } from "@/components/admin/lesson-type-fields";
import { Section } from "@/components/admin/form-controls";
import { publicCoverUrl } from "@/lib/media";
import type { CourseItem } from "@/lib/curriculum";
import {
  saveItemAction,
  uploadCoverAction,
  uploadAttachmentAction,
  removeAttachmentAction,
} from "@/app/admin/courses/[id]/items/actions";

export function ItemEditor({
  item,
  courseId,
  kindLabel,
  childCount,
  error,
}: {
  item: CourseItem;
  courseId: string;
  kindLabel: string;
  childCount: number;
  error?: string;
}) {
  const cover = publicCoverUrl(item.coverPath);
  const isChapter = item.parentId === null;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}

      <form action={saveItemAction} className="flex flex-col gap-6">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="itemId" value={item.id} />

        <LessonTypeFields item={item} kindLabel={kindLabel} />

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={item.isPublished}
            className="size-4 accent-[var(--primary)]"
          />
          Published — visible to students
          {isChapter && (
            <span className="text-muted">(a draft chapter hides its lessons too)</span>
          )}
        </label>

        <div className="flex items-center gap-4">
          <button className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover">
            Save changes
          </button>
          <Link href={`/admin/courses/${courseId}`} className="text-sm text-muted hover:text-fg">
            Back to curriculum
          </Link>
        </div>
      </form>

      <Section title="Cover image" hint="Optional thumbnail. Public — don't put paid content here.">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="aspect-[16/10] w-full max-w-56 self-start rounded-lg border border-border object-cover"
          />
        )}
        <form action={uploadCoverAction} className="flex flex-col gap-3">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="file" name="file" accept="image/*" className="text-sm" />
          <button className="w-fit rounded-full border border-border px-5 py-2 text-sm hover:border-primary">
            Upload cover
          </button>
        </form>
      </Section>

      <Section
        title="Files"
        hint="Audio, PDFs and downloads. Private — only people who own this can reach them."
      >
        {item.attachments.length === 0 && <p className="text-sm text-muted">No files yet.</p>}
        <ul className="flex flex-col gap-2">
          {item.attachments.map((a) => (
            <li
              key={a.path}
              className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
            >
              <span className="truncate">{a.name}</span>
              <form action={removeAttachmentAction}>
                <input type="hidden" name="courseId" value={courseId} />
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="path" value={a.path} />
                <button className="text-xs text-muted hover:text-fg">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={uploadAttachmentAction} className="flex flex-col gap-3">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="file" name="file" className="text-sm" />
          <button className="w-fit rounded-full border border-border px-5 py-2 text-sm hover:border-primary">
            Add file
          </button>
        </form>
      </Section>

      <div className="border-t border-border pt-6">
        <DeleteItemButton
          courseId={courseId}
          itemId={item.id}
          itemTitle={item.title}
          itemKindLabel={kindLabel}
          childCount={childCount}
        />
      </div>
    </div>
  );
}
