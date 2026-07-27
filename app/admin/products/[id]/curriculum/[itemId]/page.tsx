import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseItem } from "@/lib/curriculum";
import { countChildren } from "@/lib/curriculum-admin";
import { getProductById } from "@/lib/admin";
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
  const [item, product] = await Promise.all([getCourseItem(itemId), getProductById(id)]);
  if (!item || !product) notFound();

  const kindLabel = item.parentId === null
    ? (product.chapterLabel ?? "Chapter")
    : (product.lessonLabel ?? "Lesson");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href={`/admin/products/${id}`} className="kicker w-fit text-muted hover:text-fg">
          ← {product.title}
        </Link>
        <h1 className="text-2xl">{item.title}</h1>
      </div>
      <ItemEditor
        item={item}
        productId={id}
        kindLabel={kindLabel}
        childCount={await countChildren(itemId)}
        error={error}
      />
    </div>
  );
}
