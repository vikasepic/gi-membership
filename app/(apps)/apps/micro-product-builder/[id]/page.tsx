import { notFound } from "next/navigation";
import { requireInternalApp } from "@/lib/builtin-apps/access";
import { BUILTIN_APPS } from "@/lib/builtin-apps/registry";
import {
  loadDocuments,
  loadMessages,
  loadOwnedSession,
} from "@/lib/builtin-apps/product-builder/sessions";
import { Workspace } from "@/components/apps/product-builder/Workspace";

const APP = BUILTIN_APPS["micro-product-builder"];

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireInternalApp("micro-product-builder");
  // Another member's session id reads as missing, not as forbidden: nothing
  // about it is confirmed to someone who is not its owner.
  const session = await loadOwnedSession(id, user.id);
  if (!session) notFound();
  const [messages, documents] = await Promise.all([loadMessages(id), loadDocuments(id)]);
  return (
    <Workspace
      initialSession={session}
      initialMessages={messages}
      initialDocuments={documents}
      appRoute={APP.route}
    />
  );
}
