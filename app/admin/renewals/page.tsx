import { redirect } from "next/navigation";

// Renewals is now the next 30 days on the Subscriptions page (4 Nov 2026):
// renewals, trials converting, past due and cancellations, as it listed them.
export default function RenewalsPage() {
  redirect("/admin/subscriptions?preset=next-30");
}
