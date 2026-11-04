import { redirect } from "next/navigation";

// Trials is now a filter on the Subscriptions page (4 Nov 2026); old links and
// bookmarks land there showing trials.
export default function TrialsPage() {
  redirect("/admin/subscriptions?state=trial");
}
