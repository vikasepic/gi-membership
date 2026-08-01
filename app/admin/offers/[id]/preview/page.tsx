import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOffer } from "@/lib/store";
import { OTO_TEMPLATES } from "@/lib/oto-template";

export const dynamic = "force-dynamic";

// Preview an upsell layout with this offer's real content, before choosing it.
//
// The page renders inside an iframe rather than inline for two reasons: the
// upsell layouts break out of their container to run full-bleed bands, which
// fights an admin page that has its own padding; and a phone preview is only
// truthful when the frame has its own viewport, because media queries resolve
// against that rather than against a CSS-scaled box. A scaled desktop render
// would show `md:` styles at phone width and quietly lie about every
// breakpoint.
//
// The token passed to the frame is a placeholder, so accepting from a preview
// is rejected exactly as any invalid token is. The preview cannot charge anyone.

const DEVICES = {
  desktop: { label: "Desktop", width: "100%", height: "100%" },
  tablet: { label: "Tablet", width: "834px", height: "1112px" },
  mobile: { label: "Mobile", width: "390px", height: "844px" },
} as const;

type DeviceKey = keyof typeof DEVICES;

export default async function OtoPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ template?: string; device?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { template, device } = await searchParams;

  const offer = await getOffer(id);
  if (!offer) notFound();

  const chosen = template || offer.otoTemplate;
  const deviceKey: DeviceKey =
    device === "mobile" || device === "tablet" ? device : "desktop";
  const d = DEVICES[deviceKey];
  const href = (t: string, dev: string) =>
    `/admin/offers/${offer.id}/preview?template=${t}&device=${dev}`;

  return (
    // Fixed to the viewport so the preview gets the whole screen. An upsell page
    // judged inside a 1024px admin column is judged at the wrong size.
    <div className="fixed inset-0 z-30 flex flex-col bg-surface-2">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{offer.name}</span>
          <span className="text-xs text-muted">
            Real content, real layout. The accept button is inert here.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[...OTO_TEMPLATES, "custom"].map((t) => (
            <Link
              key={t}
              href={href(t, deviceKey)}
              className={`rounded-full border px-3.5 py-1.5 text-sm capitalize transition-colors ${
                chosen === t
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border hover:border-primary"
              }`}
            >
              {t}
              {offer.otoTemplate === t && <span aria-hidden> ✓</span>}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-full border border-border p-1">
          {(["desktop", "tablet", "mobile"] as DeviceKey[]).map((k) => (
            <Link
              key={k}
              href={href(chosen, k)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                deviceKey === k ? "bg-fg text-bg" : "text-muted hover:text-fg"
              }`}
            >
              {DEVICES[k].label}
            </Link>
          ))}
        </div>

        <Link href={`/admin/offers/${offer.id}`} className="ml-auto text-sm text-muted hover:text-fg">
          Close
        </Link>
      </header>

      <div className="flex flex-1 justify-center overflow-auto md:p-6">
        <iframe
          // Remount on change so the frame re-lays out rather than keeping the
          // previous width's render.
          key={`${chosen}-${deviceKey}`}
          src={`/oto-preview/${offer.id}?template=${chosen}`}
          title={`${offer.name} — ${chosen} on ${d.label}`}
          className={`border-0 bg-bg ${
            deviceKey === "desktop"
              ? "h-full w-full"
              : "my-auto rounded-[1.75rem] border-[10px] border-fg/85 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.55)]"
          }`}
          style={
            deviceKey === "desktop"
              ? undefined
              : { width: d.width, height: d.height, maxHeight: "calc(100% - 2rem)" }
          }
        />
      </div>
    </div>
  );
}
