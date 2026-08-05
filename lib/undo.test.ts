import { describe, it, expect } from "vitest";
import { COALESCE_MS, HISTORY_LIMIT, emptyHistory, record, redo, undo, undoIntent } from "@/lib/undo";

// What Ctrl+Z is worth depends entirely on where the steps fall.

const h0 = emptyHistory<string>();

describe("what counts as one step", () => {
  it("records the state before the change, which is where undo goes", () => {
    const h = record(h0, "a", null, 0);
    expect(undo(h, "b")?.value).toBe("a");
  });

  it("folds a run of the same thing into one", () => {
    // Dragging a size slider is one thing you did, not forty.
    let h = record(h0, "10", "size", 0);
    h = record(h, "11", "size", 100);
    h = record(h, "12", "size", 200);
    expect(h.past).toEqual(["10"]);
    expect(undo(h, "13")?.value).toBe("10");
  });

  it("starts a new step once the run goes quiet", () => {
    let h = record(h0, "10", "size", 0);
    h = record(h, "11", "size", COALESCE_MS + 1);
    expect(h.past).toEqual(["10", "11"]);
  });

  it("never folds two different things together", () => {
    let h = record(h0, "a", "size", 0);
    h = record(h, "b", "colour", 10);
    expect(h.past).toEqual(["a", "b"]);
  });

  it("never folds a structural change into anything", () => {
    // Adding, moving and deleting pass no key: each is its own act, however
    // fast it follows the last one.
    let h = record(h0, "a", null, 0);
    h = record(h, "b", null, 1);
    expect(h.past).toEqual(["a", "b"]);
  });
});

describe("stepping back and forward", () => {
  it("does nothing at the beginning", () => {
    expect(undo(h0, "a")).toBeNull();
    expect(redo(h0, "a")).toBeNull();
  });

  it("goes back and comes forward to the same place", () => {
    const h = record(h0, "a", null, 0);
    const back = undo(h, "b")!;
    expect(back.value).toBe("a");
    const forward = redo(back.history, back.value)!;
    expect(forward.value).toBe("b");
  });

  it("walks back through several steps in order", () => {
    let h = record(h0, "a", null, 0);
    h = record(h, "b", null, 1000);
    h = record(h, "c", null, 2000);
    const one = undo(h, "d")!;
    const two = undo(one.history, one.value)!;
    const three = undo(two.history, two.value)!;
    expect([one.value, two.value, three.value]).toEqual(["c", "b", "a"]);
  });

  it("drops the redo branch once you go a different way", () => {
    const h = record(h0, "a", null, 0);
    const back = undo(h, "b")!;
    expect(back.history.future).toEqual(["b"]);
    const elsewhere = record(back.history, back.value, null, 10);
    expect(elsewhere.future).toEqual([]);
  });

  it("ends the run it stepped out of", () => {
    // Otherwise the next slider move folds into the step you just took back,
    // and a second Ctrl+Z appears to do nothing.
    let h = record(h0, "10", "size", 0);
    h = record(h, "11", "size", 100);
    const back = undo(h, "12")!;
    const after = record(back.history, back.value, "size", 150);
    expect(after.past).toHaveLength(1);
  });

  it("does not grow without limit", () => {
    let h = h0;
    for (let i = 0; i < HISTORY_LIMIT + 40; i++) h = record(h, String(i), null, i * 1000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[h.past.length - 1]).toBe(String(HISTORY_LIMIT + 39));
  });
});

describe("which keystroke means what", () => {
  const key = (over: Partial<Parameters<typeof undoIntent>[0]>) =>
    undoIntent({ key: "z", metaKey: false, ctrlKey: false, shiftKey: false, ...over });

  it("takes Cmd+Z and Ctrl+Z", () => {
    expect(key({ metaKey: true })).toBe("undo");
    expect(key({ ctrlKey: true })).toBe("undo");
  });

  it("takes Shift for redo, and Ctrl+Y as well", () => {
    expect(key({ metaKey: true, shiftKey: true })).toBe("redo");
    expect(key({ key: "y", ctrlKey: true })).toBe("redo");
  });

  it("leaves Cmd+Y alone, which is Safari's history window", () => {
    expect(key({ key: "y", metaKey: true })).toBeNull();
  });

  it("ignores Z on its own, which is a letter someone is typing", () => {
    expect(key({})).toBeNull();
  });

  it("keeps its hands off a text field", () => {
    // The browser's own undo is what someone typing expects; reverting the
    // whole page instead is worse than having no shortcut.
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(key({ metaKey: true, target: { tagName } as unknown as EventTarget }), tagName).toBeNull();
    }
    expect(
      key({ metaKey: true, target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget }),
    ).toBeNull();
  });

  it("still fires over the canvas", () => {
    expect(key({ metaKey: true, target: { tagName: "DIV" } as unknown as EventTarget })).toBe("undo");
  });
});
