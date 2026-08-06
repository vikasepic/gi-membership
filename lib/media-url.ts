/**
 * The public URL for a stored cover.
 *
 * Its own file because lib/media.ts is server-only — it holds the service-role
 * client — and a client component that needs to show a picture must not drag
 * that into the browser bundle.
 */
export function publicCoverUrl(coverPath: string | null): string | null {
  if (!coverPath) return null;
  if (/^https?:\/\//i.test(coverPath)) return coverPath;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/public-media/${coverPath}`;
}
