import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { EmailPrototype } from "@/components/admin/email-prototype";

export const dynamic = "force-dynamic";

/**
 * The post-purchase email — as a prototype.
 *
 * Nothing here saves and nothing sends. It exists so the design and the panel
 * can be argued with before either is wired to a live store that takes real
 * money and emails real buyers.
 */
export default async function EmailSettingsPrototype() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/admin/settings" className="kicker text-muted hover:text-fg">
          &larr; Settings
        </Link>
        <h1 className="text-xl">Post-purchase email</h1>
        <span className="text-sm text-muted">what lands after somebody buys</span>
      </div>

      <p className="rounded-lg border border-primary/45 bg-primary/5 px-3 py-2 text-xs leading-relaxed">
        <strong className="font-medium text-fg">A prototype.</strong> Nothing on this page saves and
        nothing sends. The preview is drawn by the real builder, so what you see is the email — but
        the store is still sending its old welcome until this is wired up.
      </p>

      <EmailPrototype />
    </div>
  );
}
