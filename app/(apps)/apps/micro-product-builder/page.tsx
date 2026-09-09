import { requireInternalApp } from "@/lib/builtin-apps/access";
import { BUILTIN_APPS } from "@/lib/builtin-apps/registry";
import { listSessions } from "@/lib/builtin-apps/product-builder/sessions";
import { SessionList } from "@/components/apps/product-builder/SessionList";
import { deleteSessionAction } from "./actions";

const APP = BUILTIN_APPS["micro-product-builder"];

export default async function ProductBuilderHome() {
  const { user } = await requireInternalApp("micro-product-builder");
  const sessions = await listSessions(user.id);
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
      <SessionList sessions={sessions} appRoute={APP.route} onDelete={deleteSessionAction} />
    </main>
  );
}
