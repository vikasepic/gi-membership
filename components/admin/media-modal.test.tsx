import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/admin/media/actions", () => ({ describeMediaAction: async () => ({ ok: true }) }));
const { MediaModal, MediaButton } = await import("@/components/admin/media-modal");

// Upload and library used to be two controls side by side, which asks the wrong
// question first: nobody thinks "am I uploading or reusing", they think "I want
// this picture there".

const open = (kind: "image" | "audio" | "document" = "image") =>
  renderToStaticMarkup(
    <MediaModal kind={kind} open onClose={() => {}} onPick={() => {}} />,
  );

describe("the media window", () => {
  it("offers both ways of getting a file, in one place", () => {
    const out = open();
    expect(out).toContain("Media library");
    expect(out).toContain("Upload files");
  });

  it("opens on the library, not the upload form", () => {
    // After the first week most of what anyone wants is already in there.
    expect(open()).toContain("Search your files");
  });

  it("says nothing is selected rather than showing an empty panel", () => {
    expect(open()).toContain("Pick a file to see its details");
  });

  it("can always be dismissed", () => {
    expect(open()).toContain("Close");
  });

  it("renders nothing at all when closed", () => {
    const shut = renderToStaticMarkup(
      <MediaModal kind="image" open={false} onClose={() => {}} onPick={() => {}} />,
    );
    expect(shut).toBe("");
  });
});

describe("the button that opens it", () => {
  it("says what will happen", () => {
    expect(renderToStaticMarkup(<MediaButton kind="image" label="Select image" onPick={() => {}} />))
      .toContain("Select image");
  });

  it("keeps the window shut until it is asked for", () => {
    // A modal that renders open on load would trap someone the moment the page
    // arrives.
    const out = renderToStaticMarkup(
      <MediaButton kind="image" label="Select image" onPick={() => {}} />,
    );
    expect(out).not.toContain("Media library");
  });
});
