import "server-only";
import { publicCoverUrl, signedItemAsset } from "@/lib/media";
import type { MediaRow } from "@/lib/media-library";

/**
 * A URL an admin can look at, for either bucket.
 *
 * The two buckets are not interchangeable and this does not make them so: a
 * public file gets its permanent URL, a paid one gets a signed URL that expires
 * in ten minutes. Admin-only, behind the same guard as the rest of /admin —
 * this is the person who uploaded the file deciding whether it is the right
 * file, which is the one case where seeing a paid asset is the point.
 */
export type MediaWithUrl = MediaRow & { url: string | null };

export async function withUrls(rows: MediaRow[]): Promise<MediaWithUrl[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url:
        row.bucket === "public-media"
          ? publicCoverUrl(row.path)
          : await signedItemAsset(row.path, 600),
    })),
  );
}
