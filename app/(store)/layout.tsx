import { AppShell } from "@/components/app-shell";
import { AttributionTracker } from "@/components/attribution-tracker";
import { ConsentBanner } from "@/components/consent-banner";

// Live store — never statically prerender (server data uses runtime-only env).
export const dynamic = "force-dynamic";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AttributionTracker />
      <AppShell>{children}</AppShell>
      <ConsentBanner />
    </>
  );
}
