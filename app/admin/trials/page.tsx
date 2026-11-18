import { requireAdmin } from "@/lib/admin-guard";
import { redirect } from "next/navigation";

// Trials is now a filter on the Subscriptions page (4 Nov 2026); old links and
// bookmarks land there showing trials.
export default async function TrialsPage() {
  // Admins only, asked here as well as in the proxy: a read-only person's session passes the gate on some paths (lib/viewer-paths.ts).
  await requireAdmin();
  redirect("/admin/subscriptions?state=trial");
}
