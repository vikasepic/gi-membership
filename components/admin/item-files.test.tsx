import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// "Not sure why we have this option under the course on all type." Because a
// generic, untyped Files box sat under every lesson — including the audio and
// PDF lessons whose own panel already owned files, beside the links they belong
// with. Two boxes, no way to tell which one to use.

const editor = readFileSync("components/admin/item-editor.tsx", "utf8");
const typed = readFileSync("components/admin/lesson-type-fields.tsx", "utf8");

describe("where a lesson's files live", () => {
  it("shows the extra downloads box only where nothing else owns files", () => {
    expect(editor).toContain('item.itemType === "video" || item.itemType === "text"');
  });

  it("calls it what it is", () => {
    // "Files" next to the audio panel's own files explained nothing.
    expect(editor).toContain('title="Downloads"');
  });

  it("leaves the typed panels to own their own media", () => {
    expect(typed).toContain('addLabel="Upload an audio file"');
    expect(typed).toContain('addLabel="Upload a PDF"');
  });
});

describe("how a file gets chosen", () => {
  it("has no bare file input left in the lesson editor", () => {
    // "Choose file / No file chosen" is the browser's own control, and it looked
    // exactly as unfinished as it was.
    expect(editor).not.toContain('type="file"');
    expect(typed).not.toContain('type="file"');
  });

  it("opens the media window instead", () => {
    expect(editor).toContain("ItemFilePick");
    expect(typed).toContain("MediaButton");
  });

  it("offers a lesson only what its type can use", () => {
    // An audio lesson is never shown a PDF: choosing one would attach something
    // the player cannot play, and nothing would look wrong until a student hit it.
    expect(typed).toContain('accept.startsWith("audio") ? "audio" : "document"');
  });
});
