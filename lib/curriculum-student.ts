import type { CurriculumNode, CourseItem } from "@/lib/curriculum";
import { courseProgress, type WatchRow } from "@/lib/watch";

// A chapter WITH children is a container, not a completable unit. Countable
// items are every lesson plus every childless chapter.
export function rollupProgress(
  items: CourseItem[],
  completedIds: Set<string>,
  watch?: Map<string, WatchRow>,
): { done: number; total: number; fraction: number } {
  const countable = countableItems(items);
  const done = countable.filter((i) => completedIds.has(i.id)).length;
  // Without watch rows the bar can only be whole lessons, which is what it
  // was before long video existed. With them, a part-watched three-hour
  // lesson moves the bar while "0 of 4 complete" stays true beside it.
  if (!watch) {
    return { done, total: countable.length, fraction: countable.length ? done / countable.length : 0 };
  }
  const rows = new Map(watch);
  for (const id of completedIds) {
    const row = rows.get(id);
    rows.set(id, { completed: true, positionSeconds: row?.positionSeconds ?? null, durationSeconds: row?.durationSeconds ?? null });
  }
  return courseProgress(countable.map((i) => i.id), rows);
}

/** The items a bar counts: every lesson, plus every chapter with no children. */
export function countableItems(items: CourseItem[]): CourseItem[] {
  const published = items.filter((i) => i.isPublished);
  const parentIds = new Set(published.map((i) => i.parentId).filter(Boolean) as string[]);
  return published.filter((i) => i.parentId !== null || !parentIds.has(i.id));
}


// Reading order across the whole course. A chapter WITH children is a
// container and has no page of its own; a childless chapter is content.
export function flattenPlayable(nodes: CurriculumNode[]): CourseItem[] {
  const out: CourseItem[] = [];
  for (const ch of nodes) {
    if (ch.children.length === 0) out.push(ch);
    else out.push(...ch.children);
  }
  return out;
}

export function neighbours(
  flat: CourseItem[],
  itemId: string,
): { prev: CourseItem | null; next: CourseItem | null } {
  const i = flat.findIndex((x) => x.id === itemId);
  if (i === -1) return { prev: null, next: null };
  return { prev: flat[i - 1] ?? null, next: flat[i + 1] ?? null };
}

export function firstIncomplete(flat: CourseItem[], completed: Set<string>): CourseItem | null {
  return flat.find((i) => !completed.has(i.id)) ?? null;
}
