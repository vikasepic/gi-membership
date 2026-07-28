"use client";

import { deleteItemAction } from "@/app/admin/courses/[id]/items/actions";

// Deleting a chapter cascades: every child item AND every student's progress
// row for those items is destroyed (FK cascade). One stray click is
// unrecoverable data loss on a live store, so this requires an explicit
// confirmation naming what's about to be destroyed.
export function DeleteItemButton({
  courseId,
  itemId,
  itemTitle,
  itemKindLabel,
  childCount,
}: {
  courseId: string;
  itemId: string;
  itemTitle: string;
  itemKindLabel: string;
  childCount: number;
}) {
  const message =
    childCount > 0
      ? `Delete "${itemTitle}"? This will permanently delete ${childCount} child item(s) and all student progress for them.`
      : `Delete "${itemTitle}"? This cannot be undone.`;

  return (
    <form
      action={deleteItemAction}
      className="border-t border-border pt-6"
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="itemId" value={itemId} />
      <button className="text-sm text-muted hover:text-fg">
        Delete this {itemKindLabel.toLowerCase()}
        {childCount > 0 && ` and its ${childCount} child item(s) and their progress`}
      </button>
    </form>
  );
}
