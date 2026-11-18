import { requireAdmin } from "@/lib/admin-guard";
import { listMedia, KINDS, type MediaKind } from "@/lib/media-library";
import { withUrls } from "@/lib/media-urls";
import { MediaGrid } from "@/components/admin/media-grid";

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  // Admins only, asked here as well as in the proxy: a read-only person's session passes the gate on some paths (lib/viewer-paths.ts).
  await requireAdmin();
  const { kind: raw } = await searchParams;
  const kind = raw && raw in KINDS ? (raw as MediaKind) : undefined;
  const items = await withUrls(await listMedia(kind));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">Media</h1>
        <p className="max-w-2xl text-sm text-muted">
          Every file this store holds. Anything uploaded anywhere in the admin lands here, and any
          upload box can pick from this list instead of taking a second copy of the same file.
        </p>
      </div>

      <MediaGrid items={items} kind={kind ?? null} />
    </div>
  );
}
