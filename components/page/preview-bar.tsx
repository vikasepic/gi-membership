/** Says what this is, on every preview, above everything. */
export function PreviewBar() {
  return (
    <div className="sticky top-0 z-50 bg-navy px-3 py-1 text-center text-xs font-medium text-white">
      Preview. Drafts shown. Not live.
    </div>
  );
}
