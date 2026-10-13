import "./builtin-apps.css";
import { viewer } from "@/lib/view-as";
import { ViewAsBanner } from "@/components/view-as-banner";

// The built-in apps' frame. Not the store shell: a workspace wants a slim top
// bar and the full height under it, and none of the storefront's analytics,
// consent or code snippets belong on a page that is only ever reached signed
// in. Each app's own layout draws the bar with its name; this only sets the
// ground and the scope the app styles hang off.
export const dynamic = "force-dynamic";

export default async function BuiltinAppsLayout({ children }: { children: React.ReactNode }) {
  // An admin viewing as a member is in the member's own apps, so the frame
  // carries the same strip the store does.
  const who = await viewer();
  return (
    <div className="builtin-app flex min-h-dvh flex-col bg-bg text-fg">
      {who?.viewingAs && <ViewAsBanner name={who.name} email={who.email} />}
      {children}
    </div>
  );
}
