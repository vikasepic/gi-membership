import type { CurriculumNode, CourseItem } from "@/lib/curriculum";

// A chapter WITH children is a container, not a completable unit. Countable
// items are every lesson plus every childless chapter.
export function rollupProgress(
  items: CourseItem[],
  completedIds: Set<string>,
): { done: number; total: number } {
  const published = items.filter((i) => i.isPublished);
  const parentIds = new Set(published.map((i) => i.parentId).filter(Boolean) as string[]);
  const countable = published.filter((i) => i.parentId !== null || !parentIds.has(i.id));
  return {
    done: countable.filter((i) => completedIds.has(i.id)).length,
    total: countable.length,
  };
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
