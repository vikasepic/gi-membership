import { requireInternalApp } from "@/lib/builtin-apps/access";
import { BUILTIN_APPS } from "@/lib/builtin-apps/registry";
import { NewSession } from "@/components/apps/product-builder/NewSession";

const APP = BUILTIN_APPS["micro-product-builder"];

export default async function NewSessionPage() {
  await requireInternalApp("micro-product-builder");
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
      <NewSession appRoute={APP.route} />
    </main>
  );
}
