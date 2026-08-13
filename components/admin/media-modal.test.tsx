import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/admin/media/actions", () => ({ describeMediaAction: async () => ({ ok: true }) }));
const { MediaModal, MediaButton, Details } = await import("@/components/admin/media-modal");

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

  it("shows no file details until one is chosen", () => {
    // The stepper, the URL and the alt field all belong to a selected file.
    // Rendering their chrome against nothing would be furniture.
    const out = open();
    expect(out).not.toContain("Next file");
    expect(out).not.toContain("File URL");
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

/**
 * The details pane, which is only reachable once a file is chosen — so it is
 * rendered here directly rather than through a click the list has to answer.
 */
describe("the details pane", () => {
  const file = {
    id: "1",
    path: "media/pay-strip.png.webp",
    url: "https://x.test/pay-strip.png.webp",
    name: "pay strip",
    alt: "",
    mime: "image/webp",
    size: 3072,
    width: 290,
    height: 53,
    createdAt: "2026-08-13T00:00:00.000Z",
  };
  const pane = () =>
    renderToStaticMarkup(
      <Details item={file} neighbours={[file]} onMove={() => {}} onSaved={() => {}} onUse={() => {}} />,
    );

  it("keeps the two buttons out of the part that scrolls", () => {
    // The bug: `mt-auto` inside a scrolling column pins a thing to the end of
    // the CONTENT, not to the bottom of the pane — so a tall picture pushed
    // "Use this file" below the fold and the library looked like it had no way
    // to pick anything. Asserted structurally, because that is the mistake.
    const out = pane();
    const scroller = out.indexOf("overflow-y-auto");
    const use = out.indexOf("Use this file");
    expect(scroller).toBeGreaterThan(-1);
    expect(use).toBeGreaterThan(-1);
    // The scrolling box is closed before the buttons are opened.
    const closed = out.lastIndexOf("</div>", use);
    expect(closed).toBeGreaterThan(scroller);
  });

  it("shows the whole picture rather than a crop of its middle", () => {
    // A 290×53 payment strip cropped to 16:10 is not enough of it to recognise.
    const out = pane();
    expect(out).toContain("object-contain");
    expect(out).not.toContain("object-cover");
  });
});

/**
 * One file at a time was the whole complaint, and it had two halves: the input
 * took one, and the library — where everybody already is — had no way in at all.
 */
describe("getting files in", () => {
  it("accepts more than one at a time", () => {
    const out = open();
    // `multiple` on every picker, not just the one on the upload tab.
    const pickers = out.split('type="file"').length - 1;
    const many = out.split("multiple").length - 1;
    expect(pickers).toBeGreaterThan(0);
    expect(many).toBe(pickers);
  });

  it("offers an upload button on the library, not only on the other tab", () => {
    // The library opens first, so this is the one people see. Before this it
    // had a search box and nothing else.
    const out = open();
    expect(out).toContain("Search your files");
    expect(out).toContain(">Upload<");
  });

  it("keeps the upload tab as well, for when there is nothing to drop onto", () => {
    expect(open()).toContain("Upload files");
  });
});
