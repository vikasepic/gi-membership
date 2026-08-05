import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCourseBySlug, userOwnsCourse } from "@/lib/courses";
import { listCurriculum, getCourseItem } from "@/lib/curriculum";
import { flattenPlayable, neighbours } from "@/lib/curriculum-student";
import { completedItemIds } from "@/lib/progress";
import { LessonView } from "@/components/library/lesson-view";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

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
  const { prev, next } = neighbours(flattenPlayable(nodes), itemId);
  const done = await completedItemIds(user.id, course.id);

  return (
    <LessonView
      course={course}
      item={item}
      prev={prev}
      next={next}
      completed={done.has(item.id)}
      assetUrl={(i) => `/api/media/item/${item.id}/${i}`}
      lessonHref={(id) => `/library/${slug}/${id}`}
      backHref={{ href: `/library/${slug}`, label: course.title }}
    />
  );
}
