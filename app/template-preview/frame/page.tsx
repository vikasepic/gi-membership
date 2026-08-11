// SCRATCH — not for delivery. A fixed-width viewport for checking a template
// at phone and tablet widths.
//
// Headless Chrome will not lay out below a minimum window width: a
// --window-size=390 screenshot is a 390px CROP of a wider viewport, so every
// phone check came back looking broken when nothing was. An iframe has a real
// layout viewport at any width, so the media queries fire where they should.
// Delete before merging.

export default async function Frame({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; w?: string; h?: string }>;
}) {
  const { id = "", w = "390", h = "1700" } = await searchParams;
  return (
    <iframe
      src={`/template-preview?id=${encodeURIComponent(id)}`}
      width={Number(w)}
      height={Number(h)}
      style={{ border: 0, display: "block" }}
    />
  );
}
