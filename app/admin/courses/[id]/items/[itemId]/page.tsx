import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseItem } from "@/lib/curriculum";
import { countChildren } from "@/lib/curriculum-admin";
import { getCourse } from "@/lib/courses";
import { ItemEditor } from "@/components/admin/item-editor";

export default async function ItemEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, itemId } = await params;
  const { error } = await searchParams;
  const [item, course] = await Promise.all([getCourseItem(itemId), getCourse(id)]);
  if (!item || !course) notFound();

  const kindLabel = item.parentId === null ? course.chapterLabel : course.lessonLabel;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href={`/admin/courses/${id}`} className="kicker w-fit text-muted hover:text-fg">
          &larr; {course.title}
        </Link>
        <h1 className="text-2xl">{item.title}</h1>
      </div>
      <ItemEditor
        item={item}
        courseId={id}
        kindLabel={kindLabel}
        childCount={await countChildren(itemId)}
        error={error}
      />
    </div>
  );
}
