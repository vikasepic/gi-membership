import { AppShell } from "@/components/app-shell";
import { AttributionTracker } from "@/components/attribution-tracker";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AttributionTracker />
      <AppShell>{children}</AppShell>
    </>
  );
}
