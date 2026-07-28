import { ImageResponse } from "next/og";

// Real PNG app icons, rendered at request time. Home-screen icons must be PNG
// (Safari won't take SVG), and generating them here avoids committing binaries
// or adding an image toolchain.
export const runtime = "nodejs";

const ALLOWED = new Set([180, 192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = Number(size);
  if (!ALLOWED.has(px)) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Filled square, not a transparent glyph: Android masks icons to its
          // own shape and a transparent icon ends up floating in a white blob.
          background: "#0B0B0D",
        }}
      >
        <div
          style={{
            width: px * 0.56,
            height: px * 0.56,
            borderRadius: "50%",
            background: "#C8653D",
          }}
        />
      </div>
    ),
    { width: px, height: px },
  );
}
