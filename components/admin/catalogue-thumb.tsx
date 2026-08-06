import { publicCoverUrl } from "@/lib/media";

/**
 * The cover, small and square, beside the name.
 *
 * You recognise a product by its artwork long before you have read its title,
 * and a list of titles alone makes you read every one. Square rather than the
 * 16:10 the storefront uses: at this size the shape carries no information and
 * a row of squares lines up, which is what makes a column scannable.
 */
export function CatalogueThumb({ coverPath, alt = "" }: { coverPath: string | null; alt?: string }) {
  const url = publicCoverUrl(coverPath);
  if (!url) {
    return (
      <span
        aria-hidden
        className="block size-9 shrink-0 rounded-md border border-border bg-surface-2"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="size-9 shrink-0 rounded-md border border-border object-cover"
    />
  );
}
