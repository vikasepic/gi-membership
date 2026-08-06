import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listMedia, KINDS, type MediaKind } from "@/lib/media-library";
import { uploadToLibrary, validateUpload } from "@/lib/media";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { withUrls } from "@/lib/media-urls";
import { camelize } from "@/lib/case";
import type { MediaRow } from "@/lib/media-library";

// The library, for a picker that is already open inside some other form.
//
// A route rather than a prop: the picker appears on the product page, the
// course page, the curriculum and the page builder, and passing the whole
// library into every one of those would load it on every page whether anyone
// opened a picker or not.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const raw = url.searchParams.get("kind");
  // An unknown kind lists nothing rather than everything. A picker asking for
  // images must never be answered with PDFs because of a typo in a query.
  const kind = raw && raw in KINDS ? (raw as MediaKind) : undefined;
  if (raw && !kind) return NextResponse.json({ items: [] });

  const items = await withUrls(await listMedia(kind, url.searchParams.get("q") ?? undefined));
  return NextResponse.json({ items });
}

/**
 * Upload from inside the picker.
 *
 * The alternative is a modal that can only show what is already there, which
 * turns "I want to use a picture" into closing the modal, finding the upload
 * box, uploading, then reopening the modal to look for it.
 */
export async function POST(req: Request) {
  await requireAdmin();

  const form = await req.formData();
  const file = form.get("file");
  const raw = String(form.get("kind") ?? "image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  }
  if (!(raw in KINDS)) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });

  // An image is public artwork; anything else is paid content. Same boundary
  // the picker enforces on the way back out.
  const asCover = raw === "image";
  const check = validateUpload({ type: file.type, size: file.size }, asCover ? "cover" : "attachment");
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  try {
    const { path } = await uploadToLibrary(file, asCover ? "cover" : "attachment");
    // Read the row back rather than assembling one here, so what the picker
    // shows after an upload is exactly what it shows after a reload.
    const db = createServiceClient();
    const { data } = await db
      .from("media")
      .select("id, bucket, path, name, alt, mime, size, width, height, created_at")
      .eq("store_id", await getStoreId())
      .eq("path", path)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Uploaded, but not recorded." }, { status: 500 });
    const [item] = await withUrls([camelize<MediaRow>(data)]);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed." },
      { status: 500 },
    );
  }
}
