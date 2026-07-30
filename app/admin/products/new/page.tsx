import Link from "next/link";
import { ProductForm } from "@/components/admin/product-form";
import { listOfferOptions } from "@/lib/admin";
import { listCourses } from "@/lib/courses";

export default async function NewProductPage() {
  // Courses must be loaded here too, not only on the edit page. A published
  // product requires at least one course, so without this list the Content
  // section reads "No courses yet" even when courses exist, and a product can
  // never be created as published at all.
  const [offers, allCourses] = await Promise.all([listOfferOptions(), listCourses()]);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="kicker w-fit text-muted hover:text-fg">&larr; Products</Link>
        <h1 className="text-2xl">New product</h1>
      </div>
      <ProductForm offers={offers} allCourses={allCourses} />
    </div>
  );
}
