import { requireAdmin } from "@/lib/admin-guard";
import { redirect } from "next/navigation";

// Renewals is now the next 30 days on the Subscriptions page (4 Nov 2026):
// renewals, trials converting, past due and cancellations, as it listed them.
export default async function RenewalsPage() {
  // Admins only, asked here as well as in the proxy: a read-only person's session passes the gate on some paths (lib/viewer-paths.ts).
  await requireAdmin();
  redirect("/admin/subscriptions?preset=next-30");
}
