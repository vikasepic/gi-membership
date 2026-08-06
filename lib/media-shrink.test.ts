import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { COVER_WIDTH, COVER_HEIGHT } from "@/lib/cover";

// What was uploaded used to be exactly what every visitor downloaded: a 4MB
// phone photo behind a card 400px wide, on mobile data. These check the shrink
// itself — the same sharp pipeline lib/media.ts runs — because getting it wrong
// is invisible until someone's storefront is slow.

const pipeline = (buf: Buffer, w: number, h?: number) =>
  sharp(buf)
    .rotate()
    .resize({ width: w, height: h, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

const solid = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 90, g: 120, b: 200 } } })
    .png()
    .toBuffer();

describe("an image on its way into the public bucket", () => {
  it("comes out no bigger than anything displays it", async () => {
    const out = await pipeline(await solid(4000, 3000), COVER_WIDTH, COVER_HEIGHT);
    const { width, height } = await sharp(out).metadata();
    expect(width).toBeLessThanOrEqual(COVER_WIDTH);
    expect(height).toBeLessThanOrEqual(COVER_HEIGHT);
  });

  it("keeps its shape — the crop is the page's job, not the upload's", async () => {
    // Cropping here would bake today's frame into the file for good.
    const out = await pipeline(await solid(4000, 3000), COVER_WIDTH, COVER_HEIGHT);
    const { width, height } = await sharp(out).metadata();
    expect(width! / height!).toBeCloseTo(4 / 3, 2);
  });

  it("is never enlarged", async () => {
    // Blowing a small image up makes a bigger blurrier file, not a better one.
    const out = await pipeline(await solid(300, 200), COVER_WIDTH, COVER_HEIGHT);
    const { width } = await sharp(out).metadata();
    expect(width).toBe(300);
  });

  it("weighs a fraction of what arrived", async () => {
    const original = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 200, b: 80 } },
    })
      .png()
      .toBuffer();
    const out = await pipeline(original, COVER_WIDTH, COVER_HEIGHT);
    expect(out.byteLength).toBeLessThan(original.byteLength / 4);
  });

  it("keeps transparency", async () => {
    // JPEG would have given a logo with a cut-out background a black one.
    const png = await sharp({
      create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const out = await pipeline(png, COVER_WIDTH, COVER_HEIGHT);
    expect((await sharp(out).metadata()).hasAlpha).toBe(true);
  });

  it("stands a photo taken sideways back up", async () => {
    // EXIF orientation is stripped by the re-encode, so it has to be applied
    // first or a portrait phone photo is stored on its side.
    const sideways = await sharp(await solid(1200, 600))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const out = await pipeline(sideways, COVER_WIDTH, COVER_HEIGHT);
    const { width, height } = await sharp(out).metadata();
    expect(height).toBeGreaterThan(width!);
  });
});

describe("the code that calls it", () => {
  it("shrinks every image that reaches the public bucket", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync("lib/media.ts", "utf8"));
    // A route added later that uploads straight to public-media would quietly
    // opt out of all of the above.
    expect(src.match(/\.from\("public-media"\)/g)).toHaveLength(1); // the one inside putImage
  });
});
